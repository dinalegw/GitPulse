package git

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// PushFailureKind classifies a failed push without pretending to know more
// than Git's output establishes.
type PushFailureKind string

const (
	PushFailureAuthentication PushFailureKind = "authentication"
	PushFailureAuthorization  PushFailureKind = "authorization"
	PushFailureNetwork        PushFailureKind = "network"
	PushFailureRemoteMissing  PushFailureKind = "remote-unavailable"
	PushFailureNoRemote       PushFailureKind = "remote-not-configured"
	PushFailureBranchMissing  PushFailureKind = "branch-missing"
	PushFailureNonFastForward PushFailureKind = "non-fast-forward"
	PushFailureProtected      PushFailureKind = "protected-branch"
	PushFailureNotFound       PushFailureKind = "repository-not-found"
	PushFailureCancelled      PushFailureKind = "cancelled"
	PushFailureGeneric        PushFailureKind = "git-failure"
)

// PushError is a safe, user-facing classification of a failed push.
type PushError struct {
	Remote string
	Branch string
	Kind   PushFailureKind
	Output string
	Err    error
}

func (e *PushError) Error() string {
	message := fmt.Sprintf("Git push failed.\nRemote: %s\nBranch: %s\nCategory: %s", e.Remote, e.Branch, e.Kind)
	if e.Output != "" {
		message += "\nGit reported:\n" + e.Output
	}
	message += "\nRecommended action: " + pushRecommendation(e.Kind, e.Remote, e.Branch)
	return message
}

func (e *PushError) Unwrap() error { return e.Err }

// PushDetailed performs exactly one non-force push and classifies failures.
// It never pulls, rebases, resets, or force-pushes as recovery actions.
func (c *Client) PushDetailed(ctx context.Context, remote, branch string) error {
	out, err := c.run.Run(ctx, c.dir, "push", remote, branch)
	if err == nil {
		return nil
	}

	kind := classifyPushFailure(ctx, out, err)
	return &PushError{
		Remote: remote,
		Branch: branch,
		Kind:   kind,
		Output: sanitizeGitOutput(out + " " + err.Error()),
		Err:    err,
	}
}

func classifyPushFailure(ctx context.Context, output string, err error) PushFailureKind {
	if ctx != nil && ctx.Err() != nil {
		return PushFailureCancelled
	}

	text := strings.ToLower(output + " " + err.Error())
	switch {
	case strings.Contains(text, "authentication failed"), strings.Contains(text, "could not read username"), strings.Contains(text, "invalid username or password"), strings.Contains(text, "terminal prompts disabled"):
		return PushFailureAuthentication
	case strings.Contains(text, "permission denied"), strings.Contains(text, "permission to "), strings.Contains(text, "not allowed to push"):
		return PushFailureAuthorization
	case strings.Contains(text, "non-fast-forward"), strings.Contains(text, "fetch first"), strings.Contains(text, "rejected") && strings.Contains(text, "remote contains work"):
		return PushFailureNonFastForward
	case strings.Contains(text, "protected branch"), strings.Contains(text, "branch protection"), strings.Contains(text, "protected branch hook declined"):
		return PushFailureProtected
	case strings.Contains(text, "repository not found"), strings.Contains(text, "does not exist"):
		return PushFailureNotFound
	case strings.Contains(text, "could not resolve host"), strings.Contains(text, "connection timed out"), strings.Contains(text, "connection reset"), strings.Contains(text, "network is unreachable"), strings.Contains(text, "failed to connect"), strings.Contains(text, "connection refused"):
		return PushFailureNetwork
	case strings.Contains(text, "no such remote"), strings.Contains(text, "does not appear to be a git repository"):
		return PushFailureRemoteMissing
	case strings.Contains(text, "src refspec") && strings.Contains(text, "does not match any"):
		return PushFailureBranchMissing
	default:
		return PushFailureGeneric
	}
}

func pushRecommendation(kind PushFailureKind, remote, branch string) string {
	switch kind {
	case PushFailureAuthentication:
		return "verify your Git credentials or credential helper, then retry manually."
	case PushFailureAuthorization:
		return fmt.Sprintf("verify that your account has push permission for %s and branch %s.", remote, branch)
	case PushFailureNetwork, PushFailureRemoteMissing:
		return "verify network connectivity and the configured remote, then retry."
	case PushFailureNoRemote:
		return fmt.Sprintf("add the intended remote with 'git remote add %s <url>' if this repository should be pushed.", remote)
	case PushFailureBranchMissing:
		return fmt.Sprintf("verify that the local branch %s exists and is checked out.", branch)
	case PushFailureNonFastForward:
		return fmt.Sprintf("run 'git pull --rebase %s %s' manually, resolve conflicts if needed, and retry.", remote, branch)
	case PushFailureProtected:
		return "follow the repository's branch protection policy or push through its approved workflow."
	case PushFailureNotFound:
		return "verify the remote URL and repository access."
	case PushFailureCancelled:
		return "the push was cancelled; retry when the operation should be allowed to run."
	default:
		return "inspect the Git error above and correct the repository or remote configuration before retrying."
	}
}

var (
	credentialURLRE = regexp.MustCompile(`(?i)(https?://)([^/@\s]+):([^/@\s]+)@`)
	secretAssignmentRE = regexp.MustCompile(`(?i)(password|passwd|token|access_token|authorization)=([^\s&]+)`)
)

func sanitizeGitOutput(s string) string {
	s = credentialURLRE.ReplaceAllString(s, "$1<redacted>@")
	s = secretAssignmentRE.ReplaceAllString(s, "$1=<redacted>")
	// Also parse URLs that contain escaped or unusual user-info without ever
	// logging the raw credential-bearing URL.
	if u, err := url.Parse(strings.TrimSpace(s)); err == nil && u.User != nil {
		u.User = nil
		s = u.String()
	}
	return strings.TrimSpace(s)
}

var _ = errors.Is
