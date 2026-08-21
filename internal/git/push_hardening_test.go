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

func TestPushDetailedClassifiesFailureMatrix(t *testing.T) {
	tests := []struct {
		name string
		text string
		want PushFailureKind
	}{
		{"authorization", "permission to example/repo.git denied", PushFailureAuthorization},
		{"network", "Could not resolve host: github.com", PushFailureNetwork},
		{"remote unavailable", "fatal: 'origin' does not appear to be a git repository", PushFailureRemoteMissing},
		{"branch missing", "error: src refspec main does not match any", PushFailureBranchMissing},
		{"protected branch", "remote: protected branch hook declined", PushFailureProtected},
		{"repository not found", "remote: Repository not found.", PushFailureNotFound},
		{"generic", "fatal: unexpected git failure", PushFailureGeneric},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			run := newFakeRunner()
			run.errors["git push origin main"] = fmt.Errorf("%s", tt.text)
			c := New("/repo", run)
			err := c.PushDetailed(context.Background(), "origin", "main")
			var pushErr *PushError
			if !asPushError(err, &pushErr) {
				t.Fatalf("error type = %T, want *PushError", err)
			}
			if pushErr.Kind != tt.want {
				t.Fatalf("kind = %q, want %q; error=%v", pushErr.Kind, tt.want, err)
			}
		})
	}
}

func TestPushDetailedRedactsCredentialBearingOutput(t *testing.T) {
	run := newFakeRunner()
	run.errors["git push origin main"] = fmt.Errorf("fatal: https://user:supersecret@example.com/repo.git password=topsecret")

	c := New("/repo", run)
	err := c.PushDetailed(context.Background(), "origin", "main")
	if err == nil {
		t.Fatal("expected push error")
	}
	message := err.Error()
	if strings.Contains(message, "supersecret") || strings.Contains(message, "topsecret") {
		t.Fatalf("push error leaked secret: %v", message)
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
