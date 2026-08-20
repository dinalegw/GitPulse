package commits

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gitpulse/gitpulse/internal/config"
	"github.com/gitpulse/gitpulse/internal/git"
	"github.com/gitpulse/gitpulse/internal/logger"
)

func skipIfNoGit(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
}

// newTestEnv builds a real git repo, an optional bare remote, and a valid
// configuration pointing at it.
func newTestEnv(t *testing.T, withRemote bool) (config.Config, string) {
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

	cfg := config.Config{
		Enabled:                  true,
		RepositoryPath:           repo,
		RemoteBranch:             "main",
		CommitsPerDay:            3,
		CommitIntervalMinutes:    0,
		StartTime:                "09:00",
		EndTime:                  "18:00",
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

	if withRemote {
		remote := filepath.Join(t.TempDir(), "remote.git")
		if err := exec.Command("git", "init", "-q", "--bare", remote).Run(); err != nil {
			t.Fatal(err)
		}
		runIn(t, repo, "remote", "add", "origin", remote)
		runIn(t, repo, "push", "-q", "-u", "origin", "main")
	}

	return cfg, repo
}

func runIn(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, out)
	}
	return strings.TrimSpace(string(out))
}

func newCycle(t *testing.T, cfg config.Config, dryRun bool) *Cycle {
	t.Helper()
	log := logger.NewDiscard()
	client := git.New(cfg.RepositoryPath, git.NewRealRunner(log))
	c, err := NewCycle(cfg, client, log, dryRun)
	if err != nil {
		t.Fatalf("NewCycle: %v", err)
	}
	return c
}

func TestCycleCreatesCommitsAndPushes(t *testing.T) {
	cfg, repo := newTestEnv(t, true)
	c := newCycle(t, cfg, false)

	res, err := c.Run(context.Background())
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	if res.Created != 3 {
		t.Errorf("Created = %d, want 3", res.Created)
	}
	if !res.Pushed {
		t.Error("Pushed = false, want true")
	}

	logCount := atoi(runIn(t, repo, "rev-list", "--count", "HEAD"))
	if logCount < 4 {
		t.Errorf("HEAD count = %d, want >= 4 (3 new)", logCount)
	}

	meta := filepath.Join(repo, ".gitpulse", "activity.log")
	data, err := os.ReadFile(meta)
	if err != nil {
		t.Fatalf("metadata file missing: %v", err)
	}
	lines := strings.Count(strings.TrimSpace(string(data)), "\n") + 1
	if lines != 3 {
		t.Errorf("metadata lines = %d, want 3", lines)
	}

	// Remote must reflect the new commits.
	remoteHead := runIn(t, repo, "rev-parse", "origin/main")
	localHead := runIn(t, repo, "rev-parse", "HEAD")
	if remoteHead != localHead {
		t.Errorf("remote HEAD %s != local HEAD %s", remoteHead, localHead)
	}
}

func TestCycleSkipsPushWhenNoRemote(t *testing.T) {
	cfg, _ := newTestEnv(t, false)
	c := newCycle(t, cfg, false)

	res, err := c.Run(context.Background())
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}

	if res.Created != 3 {
		t.Errorf("Created = %d, want 3", res.Created)
	}
	if res.Pushed {
		t.Error("Pushed = true for repo without remote, want false")
	}
}

func TestCycleSequentialNumbers(t *testing.T) {
	cfg, repo := newTestEnv(t, false)
	c := newCycle(t, cfg, false)

	if _, err := c.Run(context.Background()); err != nil {
		t.Fatal(err)
	}

	// Run again; sequence numbers must continue.
	if _, err := c.Run(context.Background()); err != nil {
		t.Fatal(err)
	}

	meta := filepath.Join(repo, ".gitpulse", "activity.log")
	data, _ := os.ReadFile(meta)
	if !strings.Contains(string(data), "pulse #6") {
		t.Errorf("expected pulse #6 in metadata after two runs:\n%s", data)
	}
}

func TestCycleDryRunChangesNothing(t *testing.T) {
	cfg, repo := newTestEnv(t, false)
	c := newCycle(t, cfg, true)

	res, err := c.Run(context.Background())
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if res.Created != 3 || !res.DryRun {
		t.Errorf("dry-run result = %+v, want Created=3 DryRun=true", res)
	}
	if _, err := os.Stat(filepath.Join(repo, ".gitpulse")); !os.IsNotExist(err) {
		t.Error("dry-run must not create the metadata directory")
	}
	logCount := atoi(runIn(t, repo, "rev-list", "--count", "HEAD"))
	if logCount != 1 {
		t.Errorf("dry-run changed HEAD count to %d, want 1", logCount)
	}
}

func TestCycleFailsOnNonRepo(t *testing.T) {
	cfg, _ := newTestEnv(t, false)
	cfg.RepositoryPath = t.TempDir() // valid existing dir, but not a repo

	c := newCycle(t, cfg, false)
	_, err := c.Run(context.Background())
	if err == nil {
		t.Fatal("expected error for non-repository path")
	}
	if !strings.Contains(err.Error(), "not a git working tree") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestCycleInvalidConfigRejected(t *testing.T) {
	cfg, _ := newTestEnv(t, false)
	cfg.CommitsPerDay = 0 // invalid

	client := git.New(cfg.RepositoryPath, git.NewRealRunner(nil))
	if _, err := NewCycle(cfg, client, logger.NewDiscard(), false); err == nil {
		t.Fatal("NewCycle should reject invalid configuration")
	}
}

func TestMetadataCountMissingFileIsZero(t *testing.T) {
	cfg, repo := newTestEnv(t, false)
	meta := NewMetadata(cfg.RepositoryPath, cfg.MetadataDir, cfg.MetadataFile, logger.NewDiscard())
	count, err := meta.Count()
	if err != nil || count != 0 {
		t.Fatalf("Count() = %d, %v; want 0, nil", count, err)
	}
	if _, err := os.Stat(filepath.Join(repo, cfg.MetadataDir)); !os.IsNotExist(err) {
		t.Error("Count() must not create the metadata directory")
	}
}

func TestMetadataAppendAndCount(t *testing.T) {
	cfg, _ := newTestEnv(t, false)
	meta := NewMetadata(cfg.RepositoryPath, cfg.MetadataDir, cfg.MetadataFile, logger.NewDiscard())

	loc := mustLocation(t)
	if err := meta.Append(nowIn(t, loc), 1); err != nil {
		t.Fatalf("Append failed: %v", err)
	}
	if err := meta.Append(nowIn(t, loc), 2); err != nil {
		t.Fatalf("Append failed: %v", err)
	}

	count, err := meta.Count()
	if err != nil || count != 2 {
		t.Fatalf("Count() = %d, %v; want 2", count, err)
	}
}

func atoi(s string) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			break
		}
		n = n*10 + int(r-'0')
	}
	return n
}

func mustLocation(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("Local")
	if err != nil {
		t.Fatal(err)
	}
	return loc
}

func nowIn(t *testing.T, loc *time.Location) time.Time {
	t.Helper()
	return time.Now().In(loc)
}
