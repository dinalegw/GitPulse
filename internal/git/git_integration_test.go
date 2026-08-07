package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// skipIfNoGit skips the test when the git binary is unavailable.
func skipIfNoGit(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not available")
	}
}

// initTestRepo creates a real git repository in a temp dir with one commit.
func initTestRepo(t *testing.T) string {
	t.Helper()
	skipIfNoGit(t)

	dir := t.TempDir()
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, out)
		}
	}

	run("init", "-q", "-b", "main")
	run("config", "user.email", "test@example.com")
	run("config", "user.name", "GitPulse Test")
	writeTestFile(t, filepath.Join(dir, "file.txt"), "hello")
	run("add", ".")
	run("commit", "-q", "-m", "initial")

	return dir
}

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func TestIntegrationDetectAndCommit(t *testing.T) {
	dir := initTestRepo(t)
	ctx := context.Background()

	c := New(dir, NewRealRunner(nil))
	ok, err := c.Detect(ctx)
	if err != nil || !ok {
		t.Fatalf("Detect() = %v, %v", ok, err)
	}

	branch, err := c.CurrentBranch(ctx)
	if err != nil || branch != "main" {
		t.Fatalf("CurrentBranch() = %q, %v", branch, err)
	}

	gitpulseDir := filepath.Join(dir, ".gitpulse")
	if err := os.MkdirAll(gitpulseDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(gitpulseDir, "activity.log"), "line 1\n")
	if err := c.Add(ctx, ".gitpulse"); err != nil {
		t.Fatalf("Add failed: %v", err)
	}
	created, err := c.Commit(ctx, "chore: test commit")
	if err != nil || !created {
		t.Fatalf("Commit() = %v, %v", created, err)
	}

	clean, err := c.IsClean(ctx)
	if err != nil || !clean {
		t.Fatalf("IsClean() after commit = %v, %v", clean, err)
	}

	n, err := c.LogCount(ctx)
	if err != nil || n < 2 {
		t.Fatalf("LogCount() = %d, %v; want >= 2", n, err)
	}
}

func TestIntegrationPush(t *testing.T) {
	dir := initTestRepo(t)
	remote := filepath.Join(t.TempDir(), "remote.git")

	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
	// Create a bare remote and push HEAD to it once so origin/main exists.
	if err := exec.Command("git", "init", "-q", "--bare", remote).Run(); err != nil {
		t.Fatal(err)
	}
	run("remote", "add", "origin", remote)
	run("push", "-q", "-u", "origin", "main")

	ctx := context.Background()
	c := New(dir, NewRealRunner(nil))

	exists, err := c.RemoteBranchExists(ctx, "origin", "main")
	if err != nil || !exists {
		t.Fatalf("RemoteBranchExists() = %v, %v", exists, err)
	}

	// New commit, then push.
	writeTestFile(t, filepath.Join(dir, "file.txt"), "world")
	run("add", ".")
	run("commit", "-q", "-m", "second")
	if err := c.Push(ctx, "origin", "main"); err != nil {
		t.Fatalf("Push failed: %v", err)
	}

	// Verify remote HEAD advanced.
	out, err := runIn(dir, "rev-parse", "origin/main")
	if err != nil {
		t.Fatal(err)
	}
	local, _ := runIn(dir, "rev-parse", "HEAD")
	if strings.TrimSpace(out) != strings.TrimSpace(local) {
		t.Errorf("remote HEAD %s != local HEAD %s", out, local)
	}
}

func runIn(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	return string(out), err
}
