# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security vulnerabilities. Use a
[private GitHub security advisory](https://github.com/dinalegw/GitPulse/security/advisories/new)
to report them to the maintainers.

Please include:

- The GitPulse version affected (`gitpulse version`).
- A description of the vulnerability and its impact.
- Steps to reproduce, including a minimal example.
- A suggested fix, if you have one.

You should receive a response within 72 hours. We will coordinate a fix and
disclosure with you.

## Supported versions

| Version | Supported          |
|---------|--------------------|
| 1.0.x   | :white_check_mark: |

## Security design

GitPulse takes the following measures by design:

- **No shell execution.** All git commands run through the Go `exec` package
  with each argument passed as a separate slice element. There is no shell,
  so command injection through repository paths, branch names, or message
  templates is not possible.
- **No secret handling.** GitPulse does not read, store, or print tokens or
  credentials. Git authentication uses the user's existing git credential
  helpers. Common credential-bearing URL and secret-assignment patterns in
  Git error output are redacted before classified push errors are surfaced.
- **Restricted file permissions.** The configuration directory is created
  with `0700` and the configuration file with `0600`. Log files use `0600`.
- **Isolated writes.** GitPulse only writes inside the configured repository's
  `metadata_dir` (default `.gitpulse/`). Metadata paths are checked to prevent
  traversal outside the repository.
- **Repository mutation safety.** Automated mutation stops when tracked work
  is dirty, the repository is bare, the repository is in detached HEAD state,
  or the checked-out branch does not match the configured branch.
- **Push safety.** GitPulse performs no force pushes and does not automatically
  pull, rebase, reset, or clean a repository after a push rejection. Push
  failures are reported and require user-directed recovery when appropriate.
- **Context-aware Git operations.** Git processes are launched with the
  operation context so cancellation can terminate a running Git command.
- **Input validation.** The configuration is validated before any execution;
  invalid configurations are rejected with actionable errors.
- **Website credential isolation.** GitHub App authorization uses a validated
  canonical callback, CSRF state cookie, and PKCE. The callback uses the GitHub user
  token only for identity and installation lookup, then discards it. The
  browser session is encrypted and stored in an HttpOnly cookie.
- **Playground isolation.** The public playground accepts only allow-listed
  commands, receives no GitHub credentials, uses a disposable demo repository
  with a local fake origin, bounds output, and deletes its Vercel Sandbox.

Never paste private keys, client secrets, tokens, OAuth codes, or session
cookies into chat, source files, commits, or public issues. Rotate any secret
that is accidentally disclosed.

## Scope

The supported surface includes the GitPulse binary, configuration handling,
public website, GitHub identity flow, and playground code in this repository.
Shell configuration of the user's environment (for example credential
helpers) and provider infrastructure are outside GitPulse's control.
