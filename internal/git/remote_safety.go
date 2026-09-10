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

// LastCommitAuthor returns the author recorded on the repository's most
// recent commit. It is intentionally separate from UserIdentity: history is
// only a recovery candidate and must be confirmed by the person running
// GitPulse before it is saved to the selected repository.
func (c *Client) LastCommitAuthor(ctx context.Context) (name, email string, err error) {
	out, err := c.run.Run(ctx, c.dir, "log", "-1", "--format=%an%x00%ae")
	if err != nil {
		return "", "", fmt.Errorf("cannot read the latest commit author: %w", err)
	}
	name, email, found := strings.Cut(out, "\x00")
	if !found {
		return "", "", fmt.Errorf("latest commit does not contain a usable author identity")
	}
	name = strings.TrimSpace(name)
	email = strings.TrimSpace(email)
	if name == "" || email == "" || strings.ContainsAny(name+email, "\r\n\x00") {
		return "", "", fmt.Errorf("latest commit does not contain a usable author identity")
	}
	return name, email, nil
}

// SetLocalConfig writes a non-secret setting only to the selected
// repository's .git/config. It never changes the user's global Git setup.
func (c *Client) SetLocalConfig(ctx context.Context, key, value string) error {
	if _, err := c.run.Run(ctx, c.dir, "config", "--local", key, value); err != nil {
		return fmt.Errorf("cannot save %s in this repository: %w", key, err)
	}
	return nil
}

func (c *Client) configValue(ctx context.Context, key string) (string, error) {
	out, err := c.run.Run(ctx, c.dir, "config", "--get", key)
	if err != nil {
		return "", nil
	}
	return strings.TrimSpace(out), nil
}

// PushDryRun asks Git whether the current HEAD can be pushed to the target
// remote branch without changing the remote.
func (c *Client) PushDryRun(ctx context.Context, remote, branch string) error {
	if _, err := c.run.Run(ctx, c.dir, "push", "--dry-run", remote, "HEAD:"+branch); err != nil {
		return fmt.Errorf("push preflight failed for %s/%s: %w", remote, branch, err)
	}
	return nil
}

// PushHead pushes the currently checked-out commit to the configured remote
// branch without requiring the local and remote branch names to match.
func (c *Client) PushHead(ctx context.Context, remote, branch string) error {
	if _, err := c.run.Run(ctx, c.dir, "push", remote, "HEAD:"+branch); err != nil {
		return fmt.Errorf("cannot push HEAD to %s/%s: %w", remote, branch, err)
	}
	return nil
}
