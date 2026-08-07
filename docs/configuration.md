# Configuration

GitPulse reads its configuration from a human-readable YAML file. The default
location is `~/.gitpulse/config.yaml`; any command accepts `--config <path>`
to point at a different file.

Every key has a default. Values you set in the file override the defaults.
`gitpulse config` prints the effective configuration (defaults merged with
your file). Use `gitpulse config set <key> <value>` to change one value, or
edit the file by hand and run `gitpulse validate`.

## Reference

| Key                              | Default                        | Description                                                            |
|----------------------------------|--------------------------------|------------------------------------------------------------------------|
| `enabled`                        | `false`                        | Required for `gitpulse run --schedule`. Manual `gitpulse run` works regardless. |
| `repository_path`                | *(empty)*                      | Absolute path to the repository to commit to.                          |
| `remote_branch`                  | `main`                         | Branch to push to on the remote.                                       |
| `commits_per_day`                | `4`                            | Number of commit events per day (1–100).                               |
| `commit_interval_minutes`        | `0`                            | Fixed spacing between events in minutes. `0` spreads events evenly.    |
| `start_time`                     | `09:00`                        | Daily schedule window start, `HH:MM`.                                  |
| `end_time`                       | `18:00`                        | Daily schedule window end, `HH:MM`. Must be later than `start_time`.   |
| `timezone`                       | `Local`                        | IANA timezone for the schedule, or `Local`.                            |
| `dry_run`                        | `false`                        | Simulate cycles without changing anything when `true`.                 |
| `log_level`                      | `info`                         | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, or `panic`.        |
| `metadata_dir`                   | `.gitpulse`                    | Directory inside the repository that GitPulse owns.                    |
| `metadata_file`                  | `activity.log`                 | File inside `metadata_dir` appended to on every commit.                |
| `push_remote`                    | `origin`                       | Remote to push to after a cycle.                                       |
| `commit_message_template`        | `chore: GitPulse automated pulse #%d` | Commit message template; `%d` is the sequence number.          |
| `max_commits_per_cycle`          | `100`                          | Upper bound on commits created by a single cycle.                      |
| `minimum_commit_interval_minutes`| `1`                            | Reserved minimum spacing between events (used by validators).          |

## Scheduling model

Two ways to derive the daily event times:

1. **Even spread (default).** With `commit_interval_minutes: 0`, the
   `commits_per_day` events are spread evenly across the
   `start_time`–`end_time` window. For example, `commits_per_day: 4` with a
   `09:00`–`18:00` window produces events at `09:00`, `12:00`, `15:00`,
   `18:00`.
2. **Fixed interval.** With `commit_interval_minutes: 60`, events begin at
   `start_time` and repeat every 60 minutes until the window ends. The number
   of events never exceeds `commits_per_day`.

`gitpulse status` shows today's events and the next run.

## Example

```yaml
enabled: true
repository_path: /home/alice/projects/app
remote_branch: main
commits_per_day: 3
commit_interval_minutes: 0
start_time: "10:00"
end_time: "16:00"
timezone: Europe/Paris
dry_run: false
log_level: info
metadata_dir: .gitpulse
metadata_file: activity.log
push_remote: origin
commit_message_template: 'chore: GitPulse automated pulse #%d'
max_commits_per_cycle: 100
minimum_commit_interval_minutes: 1
```

## Validation

`gitpulse validate` reports every problem with a suggested fix:

- `repository_path` must exist and be a directory.
- `commits_per_day` must be between 1 and 100.
- `start_time`/`end_time` must be valid `HH:MM` times and the window must be
  non-empty.
- `timezone` must be a valid IANA name or `Local`.
- `log_level` must be one of the supported levels.
- `metadata_dir` must be a relative path that stays inside the repository.
- `commit_message_template` must contain a `%d` placeholder.

The scheduler and commit cycle refuse to run against a configuration that
fails validation.
