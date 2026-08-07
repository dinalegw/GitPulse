# GitPulse Architecture

GitPulse follows a clean, layered architecture. Dependencies point inward:
the `cmd` package orchestrates everything, internal packages never depend on
the CLI, and `utils` sits at the bottom of the graph with no dependencies on
other GitPulse packages.

```
┌────────────────────────────────────────────────────┐
│ cmd/       Cobra commands, flags, output, errors   │
└───────────────┬──────────────────┬─────────────────┘
                │                  │
        ┌───────▼───────┐  ┌───────▼───────┐
        │ commits/      │  │ scheduler/    │
        │ commit cycle  │  │ daily events  │
        └───────┬───────┘  └───────┬───────┘
                │                  │
        ┌───────▼───────┐  ┌───────▼───────┐
        │ git/          │  │ config/       │
        │ native git    │  │ Viper + YAML  │
        └───────┬───────┘  └───────┬───────┘
                │                  │
        ┌───────▼───────┐  ┌───────▼───────┐
        │ logger/       │  │ validation/   │
        └───────┬───────┘  └───────┬───────┘
                │                  │
        ┌───────▼──────────────────▼───────┐
        │ utils/      no internal deps     │
        └──────────────────────────────────┘
```

## Package responsibilities

| Package       | Responsibility                                                            |
|---------------|---------------------------------------------------------------------------|
| `cmd`         | Defines Cobra commands, parses flags, formats output, presents errors.    |
| `config`      | Defines the `Config` type, defaults, and load/save of the YAML file.      |
| `validation`  | Checks that a `Config` is internally consistent and actionable.           |
| `git`         | Wraps native `git` commands through a `CommandRunner` interface.          |
| `commits`     | Owns the metadata-file commit strategy and orchestrates one commit cycle. |
| `scheduler`   | Computes daily event times and runs a foreground schedule loop.           |
| `logger`      | Builds the structured (logrus) logger writing to console and file.        |
| `utils`       | Cross-cutting helpers: paths, time parsing, timezone loading.             |
| `version`     | Version metadata, overridable at build time via `-ldflags`.               |

## Key decisions

### Native git, never reinvented

Every Git operation delegates to the `git` binary installed on the host
(`git/RealRunner`). Commands are executed with the Go `exec` package passing
each argument as a separate slice element, so there is no shell and no
command-injection surface. A `CommandRunner` interface keeps the `git`
package unit-testable without a real repository.

### The metadata commit strategy

GitPulse never stages or modifies application source files. Every automated
change is a single appended line in `.gitpulse/activity.log`, and only the
`.gitpulse/` directory is staged. This isolates automation from real work and
keeps the repository history readable.

### The scheduler interface

`Scheduler` is an interface (`EventsForDay`, `NextRun`, `RunLoop`) implemented
by `DailyScheduler` for v1.0. The daily implementation computes events from
`commits_per_day`, `commit_interval_minutes`, `start_time`, `end_time`, and
`timezone`. Because scheduling logic is fully separated from commit execution
(`Job` callbacks), future versions can plug in platform schedulers or hosted
workers without restructuring the codebase.

### Push once per cycle

A cycle stages and commits N times but pushes exactly once at the end. This
avoids redundant network round-trips and keeps a cycle atomic from the
remote's point of view.

### Push as a soft failure

If no remote is configured, GitPulse warns and skips pushing so local-only
repositories remain usable. Real push failures (network, auth, rejected
refs) still surface as errors.

## Error handling

No code in GitPulse panics for user-facing failures. Errors are returned and
explain what failed, why, and how to fix it. The `validation` package renders
problems with a `Fix` recommendation on every message. The CLI prints errors
to stderr and returns a non-zero exit code.

## Testing strategy

- **Unit tests** use fakes where they exist: a fake `CommandRunner` in `git`,
  and a fake `Clock` in `scheduler` for deterministic time.
- **Integration tests** create real temporary git repositories (and bare
  remotes) to exercise the full commit/push path.
- **CLI smoke tests** execute the Cobra command tree against temporary
  configuration files.

Run everything with `./scripts/test.sh` or `go test ./...`.
