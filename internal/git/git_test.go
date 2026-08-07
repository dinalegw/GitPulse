package git

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

// fakeRunner simulates git by returning canned output for known invocations.
type fakeRunner struct {
	results map[string]string
	errors  map[string]error
	calls   []string
}

func newFakeRunner() *fakeRunner {
	return &fakeRunner{results: map[string]string{}, errors: map[string]error{}}
}

func (f *fakeRunner) Run(_ context.Context, name string, args ...string) (string, error) {
	key := "git " + strings.Join(args, " ")
	f.calls = append(f.calls, key)
	if err, ok := f.errors[key]; ok {
		return "", err
	}
	if out, ok := f.results[key]; ok {
		return out, nil
	}
	return "", fmt.Errorf("unexpected call: %s", key)
}

func TestDetectWorkingTree(t *testing.T) {
	run := newFakeRunner()
	run.results["git rev-parse --is-inside-work-tree"] = "true"

	c := New("/repo", run)
	ok, err := c.Detect(context.Background())
	if err != nil || !ok {
		t.Fatalf("Detect() = %v, %v; want true, nil", ok, err)
	}
}

func TestDetectNonRepo(t *testing.T) {
	run := newFakeRunner()
	run.errors["git rev-parse --is-inside-work-tree"] = fmt.Errorf("not a git repository")

	c := New("/repo", run)
	ok, err := c.Detect(context.Background())
	if err != nil {
		t.Fatalf("Detect on non-repo should not error: %v", err)
	}
	if ok {
		t.Error("Detect() = true for non-repo, want false")
	}
}

func TestCurrentBranch(t *testing.T) {
	run := newFakeRunner()
	run.results["git rev-parse --abbrev-ref HEAD"] = "feature/foo"

	c := New("/repo", run)
	branch, err := c.CurrentBranch(context.Background())
	if err != nil || branch != "feature/foo" {
		t.Fatalf("CurrentBranch() = %q, %v", branch, err)
	}
}

func TestCurrentBranchDetached(t *testing.T) {
	run := newFakeRunner()
	run.results["git rev-parse --abbrev-ref HEAD"] = "HEAD"

	c := New("/repo", run)
	if _, err := c.CurrentBranch(context.Background()); err == nil {
		t.Error("expected error for detached HEAD")
	}
}

func TestIsClean(t *testing.T) {
	run := newFakeRunner()
	run.results["git status --porcelain --untracked-files=no"] = ""

	c := New("/repo", run)
	clean, err := c.IsClean(context.Background())
	if err != nil || !clean {
		t.Fatalf("IsClean() = %v, %v", clean, err)
	}

	run.results["git status --porcelain --untracked-files=no"] = " M file.txt"
	clean, err = c.IsClean(context.Background())
	if err != nil || clean {
		t.Fatalf("IsClean() dirty = %v, %v; want false", clean, err)
	}
}

func TestHasRemote(t *testing.T) {
	run := newFakeRunner()
	run.results["git remote"] = "origin\nupstream"

	c := New("/repo", run)
	ok, err := c.HasRemote(context.Background(), "origin")
	if err != nil || !ok {
		t.Fatalf("HasRemote(origin) = %v, %v", ok, err)
	}
	ok, _ = c.HasRemote(context.Background(), "missing")
	if ok {
		t.Error("HasRemote(missing) = true, want false")
	}
}

func TestRemoteBranchExists(t *testing.T) {
	run := newFakeRunner()
	run.results["git branch -r --list origin/main"] = "  origin/main"

	c := New("/repo", run)
	ok, err := c.RemoteBranchExists(context.Background(), "origin", "main")
	if err != nil || !ok {
		t.Fatalf("RemoteBranchExists() = %v, %v", ok, err)
	}

	run.results["git branch -r --list origin/main"] = ""
	ok, _ = c.RemoteBranchExists(context.Background(), "origin", "main")
	if ok {
		t.Error("RemoteBranchExists() = true for missing branch")
	}
}

func TestAddPassesPathsAsArgs(t *testing.T) {
	run := newFakeRunner()
	run.results["git add -- .gitpulse"] = ""

	c := New("/repo", run)
	if err := c.Add(context.Background(), ".gitpulse"); err != nil {
		t.Fatalf("Add failed: %v", err)
	}
	want := "git add -- .gitpulse"
	if len(run.calls) != 1 || run.calls[0] != want {
		t.Errorf("Add calls = %v, want [%s]", run.calls, want)
	}
}

func TestCommitNothingToCommit(t *testing.T) {
	run := newFakeRunner()
	run.errors["git commit --quiet -m msg"] = fmt.Errorf("nothing to commit, working tree clean")

	c := New("/repo", run)
	created, err := c.Commit(context.Background(), "msg")
	if err != nil || created {
		t.Fatalf("Commit() = %v, %v; want false, nil", created, err)
	}
}

func TestCommitRealError(t *testing.T) {
	run := newFakeRunner()
	run.errors["git commit --quiet -m msg"] = fmt.Errorf("identity unknown")

	c := New("/repo", run)
	if _, err := c.Commit(context.Background(), "msg"); err == nil {
		t.Error("Commit should return the real error")
	}
}

func TestPushFailsWithContext(t *testing.T) {
	run := newFakeRunner()
	run.errors["git push origin main"] = fmt.Errorf("repository not found")

	c := New("/repo", run)
	err := c.Push(context.Background(), "origin", "main")
	if err == nil {
		t.Fatal("expected push error")
	}
	if !strings.Contains(err.Error(), "origin/main") {
		t.Errorf("push error should mention remote/branch: %v", err)
	}
}

func TestLastCommitTimeAndCount(t *testing.T) {
	run := newFakeRunner()
	run.results["git log -1 --format=%ct"] = "1750000000"
	run.results["git rev-list --count HEAD"] = "42"

	c := New("/repo", run)
	when, err := c.LastCommitTime(context.Background())
	if err != nil || when.Unix() != 1750000000 {
		t.Fatalf("LastCommitTime() = %v, %v", when, err)
	}

	n, err := c.LogCount(context.Background())
	if err != nil || n != 42 {
		t.Fatalf("LogCount() = %d, %v", n, err)
	}
}

func TestRelativePath(t *testing.T) {
	run := newFakeRunner()
	c := New("/repo", run)
	if got := c.RelativePath(".gitpulse/activity.log"); got == "" {
		t.Error("RelativePath returned empty")
	}
}
