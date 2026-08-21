package validation

import (
	"context"
	"fmt"
	"strings"

	"github.com/gitpulse/gitpulse/internal/config"
	"github.com/gitpulse/gitpulse/internal/git"
)

// ValidateRepositoryForMutation enforces the repository invariants required
// before GitPulse changes or pushes a working tree. It deliberately does not
// require a configured remote because local-only commits are supported.
func ValidateRepositoryForMutation(ctx context.Context, client *git.Client, cfg config.Config) error {
	if client == nil {
		return fmt.Errorf("git client is required")
	}

	inside, err := client.Detect(ctx)
	if err != nil {
		return fmt.Errorf("cannot inspect repository %q: %w", cfg.RepositoryPath, err)
	}
	if !inside {
		return fmt.Errorf("%q is not a git working tree; run 'git init' there first", cfg.RepositoryPath)
	}

	bare, err := client.IsBare(ctx)
	if err != nil {
		return err
	}
	if bare {
		return fmt.Errorf("%q is a bare Git repository; GitPulse requires a working tree", cfg.RepositoryPath)
	}

	branch, err := client.CurrentBranch(ctx)
	if err != nil {
		return err
	}
	configuredBranch := strings.TrimSpace(cfg.RemoteBranch)
	if configuredBranch != "" && branch != configuredBranch {
		return fmt.Errorf("repository is on branch %q, but GitPulse is configured for branch %q; check out the configured branch before running GitPulse", branch, configuredBranch)
	}

	clean, err := client.IsClean(ctx)
	if err != nil {
		return err
	}
	if !clean {
		return fmt.Errorf("repository %q has tracked working-tree or staged changes; GitPulse will not modify it. Commit or stash your changes, then retry", cfg.RepositoryPath)
	}

	return nil
}
