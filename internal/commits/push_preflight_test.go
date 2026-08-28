package commits

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/dinalegw/GitPulse/internal/logger"
)

func TestCycleDoesNotCreateCommitsWhenPushPreflightFails(t *testing.T) {
	cfg, repo := newTestEnv(t, true)
	before := runIn(t, repo, "rev-parse", "HEAD")

	// Keep the remote name configured but make its push URL unusable. The
	// preflight must fail before GitPulse appends metadata or creates a commit.
	runIn(t, repo, "remote", "set-url", "--push", "origin", filepath.Join(t.TempDir(), "missing.git"))

	c := newCycle(t, cfg, false)
	res, err := c.Run(context.Background())
	if err == nil {
		t.Fatal("expected push preflight error")
	}
	if res.Created != 0 {
		t.Fatalf("Created = %d, want 0 when preflight fails", res.Created)
	}

	after := runIn(t, repo, "rev-parse", "HEAD")
	if after != before {
		t.Fatalf("HEAD changed from %s to %s despite failed preflight", before, after)
	}
	if _, statErr := os.Stat(filepath.Join(repo, ".gitpulse", "activity.log")); !os.IsNotExist(statErr) {
		t.Fatalf("metadata file exists after failed preflight; stat error=%v", statErr)
	}

	_ = logger.NewDiscard() // keep this test package aligned with other cycle helpers
}
