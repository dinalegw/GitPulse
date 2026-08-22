# GitPulse Architecture

GitPulse follows a clean, layered architecture. Dependencies point inward:
the `cmd` package orchestrates everything, internal packages never depend on
the CLI, and `utils` sits at the bottom of the graph with no dependencies on
other GitPulse packages.

```
CLI
 ↓
Repository Resolver
 ↓
Repository Validator
 ↓
Safety Gate
 ↓
Metadata Generator
 ↓
Git Commit Cycle
 ↓
Push Validation
 ↓
Safe Push
```

The scheduler owns timing and invokes the same commit pipeline for each event:

```
Scheduler
   │
   ├── calculate next event
   ├── wait with context cancellation
   └── invoke commit cycle
             │
             ▼
       Repository Safety Gate
             │
             ▼
       Metadata → Add → Commit
             │
             ▼
       Push Validation → Push Once
```

## Package responsibilities

| Package       | Responsibility                                                            |
|---------------|---------------------------------------------------------------------------|
| `cmd`         | Defines Cobra commands, parses flags, formats output, presents errors.    |
| `config`      | Defines the `Config` type, defaults, and load/save of the YAML file.      |
| `validation`  | Checks configuration and repository mutation safety.                      |
| `git`         | Wraps native `git` commands through a `CommandRunner` interface.          |
| `commits`     | Owns the metadata-file commit strategy and orchestrates one commit cycle. |
| `scheduler`   | Computes daily event times and runs a cancellable foreground loop.        |
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

### Repository safety gate

Before a real commit cycle, GitPulse verifies that the target is a Git working
tree, is not bare, is not detached, is on the configured branch, and has no
tracked staged/working-tree changes. The mutation path performs the same
critical safety validation again immediately before each actual mutation.
Untracked files remain outside the safety check because GitPulse stages only
its own metadata directory.

Dry-run performs repository detection but never enters the mutation safety
path or writes files.

### Scheduler lifecycle

`DailyScheduler` keeps its lifecycle state under a mutex and rejects a second
concurrent `RunLoop` on the same scheduler instance. Context cancellation is a
clean shutdown. Job errors are recoverable and are logged while the scheduler
continues; scheduler calculation, timer, or other lifecycle errors are
returned to the caller. The scheduler does not create worker goroutines for
jobs, which keeps ownership and shutdown straightforward.

### Push once per cycle

A cycle stages and commits N times but pushes exactly once at the end. This
avoids redundant network round-trips and keeps a cycle atomic from the
remote's point of view.

### Safe push failures

If no remote is configured, GitPulse warns and skips pushing so local-only
repositories remain usable. When a configured push is attempted, GitPulse
performs one non-force push and classifies the resulting failure when Git
rejects it. It does not automatically pull, rebase, reset, clean, or force
push. No automatic retry policy is currently enabled; transient failures are
reported for a user-directed retry.

## Error handling

No code in GitPulse panics for user-facing failures. Errors are returned and
explain what failed, why, and how to fix it. The `validation` package renders
problems with a `Fix` recommendation on every message. Push errors include the
remote, branch, category, sanitized Git output, and category-specific
recommended action.

## Testing strategy

- **Unit tests** use fakes where they exist: a fake `CommandRunner` in `git`,
  and a fake `Clock` in `scheduler` for deterministic time.
- **Integration tests** create real temporary git repositories (and bare
  remotes) to exercise the full commit/push path.
- **CLI smoke tests** execute the Cobra command tree against temporary
  configuration files.
- **Race validation** runs `go test -race ./...` on Unix CI runners.

Run everything with `./scripts/test.sh` or `go test ./...`.
