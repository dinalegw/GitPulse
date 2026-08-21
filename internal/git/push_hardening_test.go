package git

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestPushDetailedClassifiesNonFastForward(t *testing.T) {
	run := newFakeRunner()
	run.errors["git push origin main"] = fmt.Errorf("! [rejected] main -> main (non-fast-forward)")

	c := New("/repo", run)
	err := c.PushDetailed(context.Background(), "origin", "main")
	var pushErr *PushError
	if !asPushError(err, &pushErr) {
		t.Fatalf("error type = %T, want *PushError", err)
	}
	if pushErr.Kind != PushFailureNonFastForward {
		t.Fatalf("kind = %q, want %q", pushErr.Kind, PushFailureNonFastForward)
	}
	if !strings.Contains(err.Error(), "git pull --rebase origin main") {
		t.Errorf("missing manual recovery guidance: %v", err)
	}
}

func TestPushDetailedClassifiesAuthentication(t *testing.T) {
	run := newFakeRunner()
	run.errors["git push origin main"] = fmt.Errorf("Authentication failed for 'https://example.com/repo.git'")

	c := New("/repo", run)
	err := c.PushDetailed(context.Background(), "origin", "main")
	var pushErr *PushError
	if !asPushError(err, &pushErr) || pushErr.Kind != PushFailureAuthentication {
		t.Fatalf("error = %#v, want authentication PushError", err)
	}
}

func TestPushDetailedNeverUsesForcePush(t *testing.T) {
	run := newFakeRunner()
	run.errors["git push origin main"] = fmt.Errorf("non-fast-forward")

	c := New("/repo", run)
	_ = c.PushDetailed(context.Background(), "origin", "main")

	if len(run.calls) != 1 || run.calls[0] != "git push origin main" {
		t.Fatalf("push calls = %v, want exactly one non-force push", run.calls)
	}
	for _, call := range run.calls {
		if strings.Contains(call, "--force") || strings.Contains(call, " -f") {
			t.Fatalf("force push detected in call: %s", call)
		}
	}
}

func TestPushDetailedHonorsCancelledContext(t *testing.T) {
	run := newFakeRunner()
	run.errors["git push origin main"] = context.Canceled

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	c := New("/repo", run)
	err := c.PushDetailed(ctx, "origin", "main")
	var pushErr *PushError
	if !asPushError(err, &pushErr) || pushErr.Kind != PushFailureCancelled {
		t.Fatalf("error = %#v, want cancelled PushError", err)
	}
}

func asPushError(err error, target **PushError) bool {
	if err == nil {
		return false
	}
	candidate, ok := err.(*PushError)
	if !ok {
		return false
	}
	*target = candidate
	return true
}
