package git

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestRemoteURL(t *testing.T) {
	run := newFakeRunner()
	run.results["git remote get-url --push origin"] = "git@github.com:owner/repo.git"
	c := New("/repo", run)
	got, err := c.RemoteURL(context.Background(), "origin")
	if err != nil || got != "git@github.com:owner/repo.git" {
		t.Fatalf("RemoteURL() = %q, %v", got, err)
	}
}

func TestUpstreamBranch(t *testing.T) {
	run := newFakeRunner()
	run.results["git rev-parse --abbrev-ref --symbolic-full-name @{u}"] = "origin/master"
	c := New("/repo", run)
	got, err := c.UpstreamBranch(context.Background())
	if err != nil || got != "master" {
		t.Fatalf("UpstreamBranch() = %q, %v; want master, nil", got, err)
	}
}

func TestUpstreamBranchWithoutTracking(t *testing.T) {
	run := newFakeRunner()
	run.errors["git rev-parse --abbrev-ref --symbolic-full-name @{u}"] = fmt.Errorf("no upstream")
	c := New("/repo", run)
	got, err := c.UpstreamBranch(context.Background())
	if err != nil || got != "" {
		t.Fatalf("UpstreamBranch() = %q, %v; want empty, nil", got, err)
	}
}

func TestUserIdentity(t *testing.T) {
	run := newFakeRunner()
	run.results["git config --get user.name"] = "Jane Developer"
	run.results["git config --get user.email"] = "jane@example.com"
	c := New("/repo", run)
	name, email, err := c.UserIdentity(context.Background())
	if err != nil || name != "Jane Developer" || email != "jane@example.com" {
		t.Fatalf("UserIdentity() = %q, %q, %v", name, email, err)
	}
}

func TestPushDryRunUsesHEADRefspec(t *testing.T) {
	run := newFakeRunner()
	run.results["git push --dry-run origin HEAD:main"] = "Everything up-to-date"
	c := New("/repo", run)
	if err := c.PushDryRun(context.Background(), "origin", "main"); err != nil {
		t.Fatalf("PushDryRun failed: %v", err)
	}
	if len(run.calls) != 1 || run.calls[0] != "git push --dry-run origin HEAD:main" {
		t.Fatalf("calls = %v; want HEAD refspec", run.calls)
	}
}

func TestPushHeadUsesHEADRefspec(t *testing.T) {
	run := newFakeRunner()
	run.results["git push origin HEAD:master"] = ""
	c := New("/repo", run)
	if err := c.PushHead(context.Background(), "origin", "master"); err != nil {
		t.Fatalf("PushHead failed: %v", err)
	}
	if len(run.calls) != 1 || run.calls[0] != "git push origin HEAD:master" {
		t.Fatalf("calls = %v; want HEAD refspec", run.calls)
	}
}

func TestPushDryRunFailureIsActionable(t *testing.T) {
	run := newFakeRunner()
	run.errors["git push --dry-run origin HEAD:main"] = fmt.Errorf("permission denied")
	c := New("/repo", run)
	err := c.PushDryRun(context.Background(), "origin", "main")
	if err == nil || !strings.Contains(err.Error(), "push preflight failed") {
		t.Fatalf("expected actionable preflight error, got %v", err)
	}
}
