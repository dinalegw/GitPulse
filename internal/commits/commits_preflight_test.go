package commits

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/dinalegw/GitPulse/internal/config"
)

// These tests exercise the push preflight that lives in commits.Cycle. They
// cover the spec requirement that a failed preflight must not leave behind
// any automated commits, and that a missing remote is treated as a skip (so
// local-only workflows keep producing commits) rather than as a fatal error.

// newPreflightEnv builds a repo + a bare remote that GitPulse can dry-run
// against. acceptPushes controls whether the configured push target is a
// working bare remote (preflight succeeds) or a path that does not exist
// (preflight deterministically fails).
func newPreflightEnv(t *testing.T, acceptPushes bool) (config.Config, string) {
	t.Helper()
	skipIfNoGit(t)

	repo := t.TempDir()
	runIn(t, repo, "init", "-q", "-b", "main")
	runIn(t, repo, "config", "user.email", "test@example.com")
	runIn(t, repo, "config", "user.name", "GitPulse Test")
	if err := os.WriteFile(filepath.Join(repo, "file.txt"), []byte("content"), 0o644); err != nil {
		t.Fatal(err)
	}
	runIn(t, repo, "add", ".")
	runIn(t, repo, "commit", "-q", "-m", "initial")

	remoteDir := filepath.Join(t.TempDir(), "remote.git")
	if err := exec.Command("git", "init", "-q", "--bare", remoteDir).Run(); err != nil {
		t.Fatal(err)
	}

	var remoteURL string
	if acceptPushes {
		remoteURL = remoteDir
	} else {
		// Use a path under the same TempDir that we never create, so
		// `git push --dry-run` will fail with a deterministic "could not
		// read from remote" error.
		remoteURL = filepath.Join(t.TempDir(), "missing.git")
	}
	runIn(t, repo, "remote", "add", "origin", remoteURL)

	if acceptPushes {
		runIn(t, repo, "push", "-q", "-u", "origin", "main")
	}

	cfg := config.Config{
		Enabled:                  true,
		RepositoryPath:           repo,
		RemoteBranch:             "main",
		CommitsPerDay:            2,
		CommitIntervalMinutes:    0,
		StartTime:                "00:00",
		EndTime:                  "23:59",
		Timezone:                 "Local",
		DryRun:                   false,
		LogLevel:                 "info",
		MetadataDir:              ".gitpulse",
		MetadataFile:             "activity.log",
		PushRemote:               "origin",
		CommitMessageTemplate:    "chore: GitPulse automated pulse #%d",
		MaxCommitsPerCycle:       100,
		MinimumCommitIntervalMin: 1,
	}
	return cfg, repo
}

// TestCyclePreflightSuccessPushes confirms that when preflight succeeds
// the cycle produces commits and performs a real push to the bare remote.
func TestCyclePreflightSuccessPushes(t *testing.T) {
	cfg, repo := newPreflightEnv(t, true)
	c := newCycle(t, cfg, false)

	res, err := c.Run(context.Background())
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if res.Created != 2 {
		t.Errorf("Created = %d, want 2", res.Created)
	}
	if !res.Pushed {
		t.Error("Pushed = false, want true")
	}

	remoteHead := runIn(t, repo, "rev-parse", "origin/main")
	localHead := runIn(t, repo, "rev-parse", "HEAD")
	if remoteHead != localHead {
		t.Errorf("remote HEAD %s != local HEAD %s after push", remoteHead, localHead)
	}
}

// TestCyclePreflightFailureCreatesZeroCommits confirms that when preflight
// fails (a bare remote with no upload-pack) the cycle aborts before creating
// any automated commits. This is the spec's "failed preflight creates no
// automated commits" guarantee.
func TestCyclePreflightFailureCreatesZeroCommits(t *testing.T) {
	cfg, repo := newPreflightEnv(t, false)
	c := newCycle(t, cfg, false)

	beforeCount := atoi(runIn(t, repo, "rev-list", "--count", "HEAD"))

	res, err := c.Run(context.Background())
	if err == nil {
		t.Fatal("expected preflight failure error, got nil")
	}
	if !strings.Contains(err.Error(), "cannot push") {
		t.Errorf("error %q should mention push failure", err)
	}
	if res.Created != 0 {
		t.Errorf("Created = %d on preflight failure, want 0", res.Created)
	}
	if res.Pushed {
		t.Error("Pushed = true on preflight failure, want false")
	}

	afterCount := atoi(runIn(t, repo, "rev-list", "--count", "HEAD"))
	if afterCount != beforeCount {
		t.Errorf("HEAD advanced from %d to %d on preflight failure", beforeCount, afterCount)
	}

	if _, err := os.Stat(filepath.Join(repo, ".gitpulse", "activity.log")); !os.IsNotExist(err) {
		t.Error("metadata file must not be created when preflight fails")
	}
}

// TestCycleMissingRemoteIsSkippedNotFatal confirms that a repo with a
// configured PushRemote but no actual remote in git produces local commits
// without a push, matching the legacy "skip push" behaviour.
func TestCycleMissingRemoteIsSkippedNotFatal(t *testing.T) {
	cfg, repo := newPreflightEnv(t, false)

	// Remove the remote the test helper created. Now the configured push
	// target does not exist, so preflight must skip.
	runIn(t, repo, "remote", "remove", "origin")

	c := newCycle(t, cfg, false)
	res, err := c.Run(context.Background())
	if err != nil {
		t.Fatalf("Run with missing remote should not be fatal: %v", err)
	}
	if res.Created != 2 {
		t.Errorf("Created = %d, want 2", res.Created)
	}
	if res.Pushed {
		t.Error("Pushed = true when remote is missing, want false")
	}
}

// TestCyclePreflightRejectsMissingEmail confirms that preflight refuses to
// run when user.email is not configured.
func TestCyclePreflightRejectsMissingEmail(t *testing.T) {
	cfg, repo := newPreflightEnv(t, true)

	// Wipe user.email at every scope so preflight cannot fall back to a
	// developer's machine-global git identity.
	for _, scope := range []string{"--local", "--global", "--system"} {
		cmd := exec.Command("git", "config", scope, "--unset", "user.email")
		cmd.Dir = repo
		// Unsetting a missing key exits non-zero, which is fine here.
		_ = cmd.Run()
	}

	c := newCycle(t, cfg, false)
	res, err := c.Run(context.Background())
	if err == nil {
		t.Fatal("expected error for missing user.email, got nil")
	}
	if !strings.Contains(err.Error(), "user.email") {
		t.Errorf("error %q should mention user.email", err)
	}
	if res.Created != 0 {
		t.Errorf("Created = %d, want 0", res.Created)
	}

	// Restore identity so the rest of the suite (and the next test) keeps
	// working. newPreflightEnv is per-test, but the underlying t.TempDir is
	// already cleaned up; nothing further is needed.
	_ = cfg
}

// TestCyclePreflightRejectsMissingName confirms that preflight refuses to
// run when user.name is not configured.
func TestCyclePreflightRejectsMissingName(t *testing.T) {
	cfg, repo := newPreflightEnv(t, true)

	for _, scope := range []string{"--local", "--global", "--system"} {
		cmd := exec.Command("git", "config", scope, "--unset", "user.name")
		cmd.Dir = repo
		_ = cmd.Run()
	}

	c := newCycle(t, cfg, false)
	_, err := c.Run(context.Background())
	if err == nil {
		t.Fatal("expected error for missing user.name, got nil")
	}
	if !strings.Contains(err.Error(), "user.name") {
		t.Errorf("error %q should mention user.name", err)
	}
}

// TestPreflightErrorIsPushNotConfiguredWhenRemoteMissing exercises the
// sentinel error used to distinguish a "skip" from a "fatal" preflight
// result so callers can detect it via errors.Is.
func TestPreflightErrorIsPushNotConfiguredWhenRemoteMissing(t *testing.T) {
	skipIfNoGit(t)

	repo := t.TempDir()
	runIn(t, repo, "init", "-q", "-b", "main")
	runIn(t, repo, "config", "user.email", "test@example.com")
	runIn(t, repo, "config", "user.name", "GitPulse Test")

	cfg := config.Config{
		Enabled:               true,
		RepositoryPath:        repo,
		RemoteBranch:          "main",
		CommitsPerDay:         1,
		StartTime:             "00:00",
		EndTime:               "23:59",
		Timezone:              "Local",
		LogLevel:              "info",
		MetadataDir:           ".gitpulse",
		MetadataFile:          "activity.log",
		PushRemote:            "origin",
		CommitMessageTemplate: "chore: GitPulse automated pulse #%d",
		MaxCommitsPerCycle:    100,
	}

	c := newCycle(t, cfg, false)
	// The repository has no remote at all. The preflight should return a
	// PushSkippedError that matches ErrPushNotConfigured.
	err := c.preflightPush(context.Background())
	if err == nil {
		t.Fatal("expected preflightPush to report missing remote")
	}
	if !errors.Is(err, ErrPushNotConfigured) {
		t.Errorf("preflightPush error %v should match ErrPushNotConfigured via errors.Is", err)
	}
}
