// Package git wraps native git commands used by GitPulse.
//
// GitPulse never reinvents Git. Every operation delegates to the git binary
// installed on the system, which keeps behavior identical to what developers
// run by hand. All commands are executed with the exec package passing each
// argument as a separate slice element, which prevents shell injection.
package git

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/dinalegw/GitPulse/internal/logger"
)

// CommandRunner executes git commands and returns their combined output.
// Runner is an interface so that tests can substitute a fake implementation
// without a real git binary.
type CommandRunner interface {
	Run(ctx context.Context, name string, args ...string) (string, error)
}

// RealRunner executes commands against the git binary on the system.
type RealRunner struct {
	log *logger.Logger
}

// NewRealRunner creates a CommandRunner that executes git on the host.
func NewRealRunner(log *logger.Logger) *RealRunner {
	return &RealRunner{log: log}
}

// Run executes the git command and returns trimmed combined output.
func (r *RealRunner) Run(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = name

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if r.log != nil {
		r.log.WithField(logger.FieldCommand, "git "+strings.Join(args, " ")).Debug("git command")
	}

	if err := cmd.Run(); err != nil {
		if stderr.Len() > 0 {
			return "", fmt.Errorf("%s", strings.TrimSpace(stderr.String()))
		}
		return "", err
	}
	return strings.TrimSpace(stdout.String()), nil
}

// Client executes git commands against a single repository directory.
type Client struct {
	dir string
	run CommandRunner
}

// New creates a git Client that operates on the repository at dir.
func New(dir string, run CommandRunner) *Client {
	return &Client{dir: dir, run: run}
}

// Dir returns the repository directory the client operates on.
func (c *Client) Dir() string { return c.dir }

// Detect reports whether dir is inside a git working tree. A directory that
// exists but is not a repository returns (false, nil).
func (c *Client) Detect(ctx context.Context) (bool, error) {
	out, err := c.run.Run(ctx, c.dir, "rev-parse", "--is-inside-work-tree")
	if err != nil {
		return false, nil
	}
	return out == "true", nil
}

// IsClean reports whether the working tree has no staged or unstaged changes.
// Untracked files are ignored because GitPulse manages its own files and
// never touches the rest of the tree.
func (c *Client) IsClean(ctx context.Context) (bool, error) {
	out, err := c.run.Run(ctx, c.dir, "status", "--porcelain", "--untracked-files=no")
	if err != nil {
		return false, fmt.Errorf("cannot read git status: %w", err)
	}
	return out == "", nil
}

// CurrentBranch returns the name of the checked out branch.
func (c *Client) CurrentBranch(ctx context.Context) (string, error) {
	out, err := c.run.Run(ctx, c.dir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", fmt.Errorf("cannot determine current branch: %w", err)
	}
	if out == "HEAD" {
		return "", fmt.Errorf("repository is in detached HEAD state; check out a branch first")
	}
	return out, nil
}

// HasRemote reports whether a remote with the given name exists.
func (c *Client) HasRemote(ctx context.Context, name string) (bool, error) {
	out, err := c.run.Run(ctx, c.dir, "remote")
	if err != nil {
		return false, fmt.Errorf("cannot list remotes: %w", err)
	}
	for _, line := range strings.Split(out, "\n") {
		if strings.TrimSpace(line) == name {
			return true, nil
		}
	}
	return false, nil
}

// RemoteBranchExists reports whether the given branch exists on the given
// remote, e.g. "origin/main".
func (c *Client) RemoteBranchExists(ctx context.Context, remote, branch string) (bool, error) {
	ref := remote + "/" + branch
	out, err := c.run.Run(ctx, c.dir, "branch", "-r", "--list", ref)
	if err != nil {
		return false, fmt.Errorf("cannot list remote branches: %w", err)
	}
	return strings.TrimSpace(out) != "", nil
}

// Add stages the given paths relative to the repository root. GitPulse only
// ever stages the paths it is explicitly told to stage.
func (c *Client) Add(ctx context.Context, paths ...string) error {
	args := []string{"add", "--"}
	args = append(args, paths...)
	if _, err := c.run.Run(ctx, c.dir, args...); err != nil {
		return fmt.Errorf("cannot stage files (%s): %w", strings.Join(paths, ", "), err)
	}
	return nil
}

// Commit creates a commit with the given message. It returns false with nil
// error when there is nothing to commit.
func (c *Client) Commit(ctx context.Context, message string) (bool, error) {
	out, err := c.run.Run(ctx, c.dir, "commit", "--quiet", "-m", message)
	if err != nil {
		msg := strings.ToLower(out + " " + err.Error())
		if strings.Contains(msg, "nothing to commit") || strings.Contains(msg, "no changes added") {
			return false, nil
		}
		return false, fmt.Errorf("cannot create commit: %w", err)
	}
	return true, nil
}

// Push pushes the local branch to the remote branch. It returns an error with
// actionable guidance when the push fails.
func (c *Client) Push(ctx context.Context, remote, branch string) error {
	if _, err := c.run.Run(ctx, c.dir, "push", remote, branch); err != nil {
		return fmt.Errorf("cannot push to %s/%s: %w (verify the remote exists and that you have push access)", remote, branch, err)
	}
	return nil
}

// SetRemote adds or updates a remote with the given name and URL.
func (c *Client) SetRemote(ctx context.Context, name, url string) error {
	if _, err := c.run.Run(ctx, c.dir, "remote", "set-url", name, url); err != nil {
		return fmt.Errorf("cannot set remote %q to %q: %w", name, url, err)
	}
	return nil
}

// AddRemote adds a remote with the given name and URL. It returns an error if
// the remote already exists.
func (c *Client) AddRemote(ctx context.Context, name, url string) error {
	if _, err := c.run.Run(ctx, c.dir, "remote", "add", name, url); err != nil {
		return fmt.Errorf("cannot add remote %q to %q: %w (the remote may already exist)", name, url, err)
	}
	return nil
}

// Pull pulls changes from the remote into the current branch.
func (c *Client) Pull(ctx context.Context, remote, branch string) error {
	if _, err := c.run.Run(ctx, c.dir, "pull", remote, branch); err != nil {
		return fmt.Errorf("cannot pull from %s/%s: %w (verify the remote exists and that you have pull access)", remote, branch, err)
	}
	return nil
}

// LogCount returns the number of commits reachable from HEAD.
func (c *Client) LogCount(ctx context.Context) (int, error) {
	out, err := c.run.Run(ctx, c.dir, "rev-list", "--count", "HEAD")
	if err != nil {
		return 0, fmt.Errorf("cannot count commits: %w", err)
	}
	n := 0
	for _, r := range out {
		if r < '0' || r > '9' {
			break
		}
		n = n*10 + int(r-'0')
	}
	return n, nil
}

// LastCommitTime returns the commit time of the most recent commit on HEAD,
// in the repository's configured timezone (offset local to the commit).
func (c *Client) LastCommitTime(ctx context.Context) (time.Time, error) {
	out, err := c.run.Run(ctx, c.dir, "log", "-1", "--format=%ct")
	if err != nil {
		return time.Time{}, fmt.Errorf("cannot read last commit time: %w", err)
	}
	unix := int64(0)
	for _, r := range out {
		if r < '0' || r > '9' {
			break
		}
		unix = unix*10 + int64(r-'0')
	}
	if unix == 0 {
		return time.Time{}, fmt.Errorf("repository has no commits yet")
	}
	return time.Unix(unix, 0), nil
}

// IsBare reports whether the repository at c.dir is a bare repository.
func (c *Client) IsBare(ctx context.Context) (bool, error) {
	out, err := c.run.Run(ctx, c.dir, "rev-parse", "--is-bare-repository")
	if err != nil {
		return false, fmt.Errorf("cannot determine if repository is bare: %w", err)
	}
	return out == "true", nil
}

// TopLevel returns the absolute path to the top-level working tree directory.
func (c *Client) TopLevel(ctx context.Context) (string, error) {
	out, err := c.run.Run(ctx, c.dir, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", fmt.Errorf("cannot determine repository root: %w", err)
	}
	return out, nil
}

// RelativePath resolves a path inside the repository to an absolute path.
func (c *Client) RelativePath(rel string) string {
	return filepath.Join(c.dir, rel)
}

// EnsureGitAvailable returns an error if the git binary cannot be found in
// the current PATH.
func EnsureGitAvailable() error {
	if _, err := exec.LookPath("git"); err != nil {
		return fmt.Errorf("git is not installed or not in PATH: %w", err)
	}
	return nil
}
