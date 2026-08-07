# GitPulse

GitPulse is an open-source command-line application that automates scheduled
Git commits on repositories you choose.

It automates routine Git operations while giving you complete control over
which repository is used, how many commits are created, when commits occur,
and how commits are generated. GitPulse never performs actions without your
explicit configuration.

> **Important principle.** GitPulse is not a tool for deceiving GitHub or
> faking software development activity. It automates user-configured Git
> operations. You are responsible for ensuring that automated commits
> accurately reflect meaningful repository activity.

---

## Features

- Initialize GitPulse and store human-readable configuration.
- Configure a repository, remote branch, commits per day, schedule window,
  timezone, and logging level.
- Isolated commit strategy: automated changes live in a dedicated
  `.gitpulse/` metadata directory and never touch your source files.
- Automatically stage, commit, and push (once per cycle).
- Dry-run mode that simulates a full cycle without changing anything.
- Daily scheduler for running in the foreground on a schedule.
- Clear validation, status, logs, and health-check commands.
- Structured logging to a log file and the console.
- Cross-platform: Windows, macOS, and Linux.

## Installation

### From source

Requirements: Go 1.24 or newer and `git` on your `PATH`.

```sh
git clone https://github.com/gitpulse/gitpulse.git
cd gitpulse
./scripts/build.sh
```

The binary is written to `bin/gitpulse`. Install it to your `PATH`:

```sh
./scripts/install.sh
```

### Verify

```sh
gitpulse version
gitpulse doctor
```

## Quick start

```sh
# 1. Initialize a configuration for a repository.
gitpulse init --repo /path/to/repository

# 2. Check everything is wired up correctly.
gitpulse validate
gitpulse status

# 3. Simulate a commit cycle without touching anything.
gitpulse run --dry-run

# 4. Create commits now (stages .gitpulse/, commits, and pushes once).
gitpulse run

# 5. Run continuously on your configured daily schedule.
gitpulse run --schedule
```

## How it works

A single run (`gitpulse run`) creates the configured number of commits. Each
commit:

1. Appends one line to `.gitpulse/activity.log` in the repository.
2. Stages only the `.gitpulse/` directory.
3. Creates a conventional commit, e.g. `chore: GitPulse automated pulse #4`.
4. After the cycle, pushes once to `origin/<remote_branch>`.

Because only the metadata directory is staged, application source files are
never modified by GitPulse. If no remote is configured, pushing is skipped
with a warning.

Scheduled mode (`gitpulse run --schedule`) stays in the foreground and creates
one commit at each scheduled time: the configured `commits_per_day` events are
spread evenly across the `start_time`–`end_time` window (or spaced by
`commit_interval_minutes` if set). It requires `enabled: true`.

## Commands

| Command               | Purpose                                          |
|-----------------------|--------------------------------------------------|
| `gitpulse init`       | Create the configuration file.                   |
| `gitpulse config`     | Show the effective configuration.                |
| `gitpulse config set` | Change a single configuration value.             |
| `gitpulse run`        | Create and push a cycle of commits now.          |
| `gitpulse run --schedule` | Run continuously on the configured schedule. |
| `gitpulse status`     | Show repository, configuration, and schedule.    |
| `gitpulse logs`       | Show recent log entries.                         |
| `gitpulse validate`   | Validate the configuration and repository.       |
| `gitpulse doctor`     | Run environment and configuration health checks. |
| `gitpulse version`    | Print version and build information.             |
| `gitpulse help`       | Help for any command.                            |

Run `gitpulse help <command>` for usage, examples, and flags.

## Configuration

Configuration is stored as human-readable YAML, by default at
`~/.gitpulse/config.yaml`. Override the location with `--config` on any
command.

```yaml
enabled: true
repository_path: /home/alice/projects/app
remote_branch: main
commits_per_day: 4
commit_interval_minutes: 0
start_time: "09:00"
end_time: "18:00"
timezone: Local
dry_run: false
log_level: info
metadata_dir: .gitpulse
metadata_file: activity.log
push_remote: origin
commit_message_template: 'chore: GitPulse automated pulse #%d'
max_commits_per_cycle: 100
minimum_commit_interval_minutes: 1
```

See [docs/configuration.md](docs/configuration.md) for every key, its
default, and its meaning.

## Documentation

- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [CLI reference](docs/cli.md)

## Development

```sh
./scripts/test.sh       # go vet + go test ./...
```

The project uses conventional commits. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## Security

See [SECURITY.md](SECURITY.md). Report vulnerabilities privately.

## License

[MIT](LICENSE)
