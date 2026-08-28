package git

import (
	"context"
	"fmt"
	"strings"
)

// RemoteURL returns the push URL configured for a remote. Using the push URL
// matters because fetch and push URLs may intentionally differ.
func (c *Client) RemoteURL(ctx context.Context, remote string) (string, error) {
	out, err := c.run.Run(ctx, c.dir, "remote", "get-url", "--push", remote)
	if err != nil {
		return "", fmt.Errorf("cannot read push URL for remote %q: %w", remote, err)
	}
	return strings.TrimSpace(out), nil
}

// UpstreamBranch returns the branch tracked by the current local branch. It
// returns an empty branch when no upstream is configured.
func (c *Client) UpstreamBranch(ctx context.Context) (string, error) {
	out, err := c.run.Run(ctx, c.dir, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
	if err != nil {
		return "", nil
	}
	out = strings.TrimSpace(out)
	parts := strings.SplitN(out, "/", 2)
	if len(parts) != 2 || parts[1] == "" {
		return "", nil
	}
	return parts[1], nil
}

// UserIdentity returns the Git author identity configured for the repository.
// GitHub associates commits with accounts through the author email, so an
// empty email is a configuration error for a GitHub-facing workflow.
func (c *Client) UserIdentity(ctx context.Context) (name, email string, err error) {
	name, err = c.configValue(ctx, "user.name")
	if err != nil {
		return "", "", err
	}
	email, err = c.configValue(ctx, "user.email")
	if err != nil {
		return "", "", err
	}
	return strings.TrimSpace(name), strings.TrimSpace(email), nil
}

func (c *Client) configValue(ctx context.Context, key string) (string, error) {
	out, err := c.run.Run(ctx, c.dir, "config", "--get", key)
	if err != nil {
		return "", nil
	}
	return strings.TrimSpace(out), nil
}

// PushDryRun asks Git whether the current HEAD can be pushed to the target
// remote branch without changing the remote. It catches common authentication,
// permission, protection, and remote configuration failures before GitPulse
// has performed another automated cycle.
func (c *Client) PushDryRun(ctx context.Context, remote, branch string) error {
	if _, err := c.run.Run(ctx, c.dir, "push", "--dry-run", remote, "HEAD:"+branch); err != nil {
		return fmt.Errorf("push preflight failed for %s/%s: %w", remote, branch, err)
	}
	return nil
}

// PushHead pushes the currently checked-out commit to the configured remote
// branch. It does not require a local branch with the same name as the remote
// branch, so master/main and feature/default-branch combinations work.
func (c *Client) PushHead(ctx context.Context, remote, branch string) error {
	if _, err := c.run.Run(ctx, c.dir, "push", remote, "HEAD:"+branch); err != nil {
		return fmt.Errorf("cannot push HEAD to %s/%s: %w", remote, branch, err)
	}
	return nil
}
