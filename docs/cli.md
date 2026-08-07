# CLI Reference

Global flags can be passed to any command:

| Flag              | Description                                                          |
|-------------------|----------------------------------------------------------------------|
| `--config <path>` | Path to the configuration file (default `~/.gitpulse/config.yaml`).  |
| `--log-level <l>` | Override the configured log level.                                   |
| `-v, --version`   | Print version information and exit (on the root command).            |

Every command supports `-h, --help`.

---

## `gitpulse init`

Initialize a GitPulse configuration file. Refuses to overwrite an existing
configuration.

```
Usage:
  gitpulse init [flags]

Flags:
      --repo string       repository path (default: current directory if it is a git repository)
      --branch string     remote branch to push to (default: main)
      --commits int       number of commits per day (default: 4)
      --enabled           mark GitPulse as enabled
      --dry-run           enable dry-run mode
      --no-detect         do not auto-detect the repository from the current directory
```

Examples:

```
  gitpulse init
  gitpulse init --repo /path/to/repo
  gitpulse init --repo ~/projects/app --branch main --commits 3
  gitpulse init --repo ~/projects/app --enabled
```

Error example:

```
  Error: GitPulse is already initialized at ~/.gitpulse/config.yaml; use
  'gitpulse config set <key> <value>' to change settings, or delete the file
  to re-initialize
```

---

## `gitpulse config`

Show the effective configuration (defaults merged with the file).

```
Usage:
  gitpulse config [flags]
  gitpulse config [command]
```

### `gitpulse config show`

Alias for `gitpulse config`.

### `gitpulse config path`

Print the configuration file path.

### `gitpulse config set <key> <value>`

Set a single configuration value and persist it.

```
Usage:
  gitpulse config set <key> <value> [flags]
```

Examples:

```
  gitpulse config set repository_path /home/alice/projects/app
  gitpulse config set commits_per_day 3
  gitpulse config set start_time 10:00
  gitpulse config set timezone Europe/Paris
  gitpulse config set enabled true
```

Error example:

```
  Error: unknown configuration key "branchh"
```

---

## `gitpulse run`

Create and push GitPulse commits.

```
Usage:
  gitpulse run [flags]

Flags:
      --schedule        run continuously on the configured daily schedule
      --daemon          alias for --schedule
      --once            run a single cycle and exit (default behavior)
      --dry-run         simulate the cycle without creating commits
      --no-dry-run      force real commits even if dry_run is enabled
      --count int       number of commits to create (default: commits_per_day)
```

Without flags, `run` performs one cycle immediately. With `--schedule` it
stays in the foreground, creating one commit per scheduled event until
interrupted (requires `enabled: true`).

Examples:

```
  gitpulse run
  gitpulse run --dry-run
  gitpulse run --count 2
  gitpulse run --schedule
```

Error example (disabled):

```
  Error: GitPulse is disabled (enabled: false); scheduled runs require
  enabled=true. Enable it with 'gitpulse config set enabled true', or run a
  one-shot cycle with 'gitpulse run --once'
```

---

## `gitpulse status`

Show repository, configuration, and schedule status: enabled state, branch,
working tree cleanliness, remote, today's scheduled events, and next run.

---

## `gitpulse logs`

Show recent log entries from `~/.gitpulse/gitpulse.log`.

```
Usage:
  gitpulse logs [flags]

Flags:
  -n, --lines int   number of lines to show (default 50)
      --tail        show the most recent lines (default true)
```

---

## `gitpulse validate`

Validate the configuration and inspect the repository. Exit code 0 means
valid; 1 means problems were found. Every problem includes a `Fix` hint.

---

## `gitpulse version`

Print version, build date, Go version, and platform.

---

## `gitpulse doctor`

Run environment and configuration health checks:

1. `git` is installed and on `PATH`.
2. The configuration file exists.
3. The configuration is valid.
4. The repository is a git working tree.
5. The remote branch exists on the remote (warns on first push).
6. The log file is writable.

Each check prints `[OK]`, `[WARN]`, or `[FAIL]`. Exit code 1 when any check
fails.

---

## Exit codes

| Code | Meaning                                  |
|------|------------------------------------------|
| 0    | Success.                                 |
| 1    | Command failed (validation, git, config).|
