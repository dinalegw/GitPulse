# Changelog

All notable changes to GitPulse are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — v1 stabilization

### Fixed

- Hardened the scheduler lifecycle so one `DailyScheduler` cannot run two
  loops concurrently.
- Made scheduler cancellation and timer errors explicit and safe.
- Fixed the existing scheduler race in the job-error regression test so the
  race detector can validate the test correctly.
- Centralized repository mutation safety checks for automation cycles.
- GitPulse now blocks automated mutation for dirty tracked work, bare
  repositories, detached HEAD, unexpected configured branches, and unsafe
  metadata paths.
- Repository safety is re-checked immediately before each real mutation to
  reduce time-of-check/time-of-use gaps.
- Git push failures now have explicit categories and actionable guidance.
- Push recovery never performs pull, rebase, reset, or force-push operations.
- Push operations remain exactly one non-force attempt per cycle when a remote
  is configured; no automatic retry policy was added.
- Push error output is sanitized for common credential-bearing URL and secret
  assignment patterns before it is surfaced.
- Made existing absolute-path tests platform-correct so the cross-platform CI
  suite passes on Windows as well as Unix systems.

### CI

- Added `go test -race ./...` to Unix CI validation.
- Kept formatting validation on Unix where the repository's canonical source
  formatting is checked; Windows continues to validate vet, tests, and build.

## [1.0.0] - 2026-08-07

### Added

- `init` command to create a GitPulse configuration file.
- `config`, `config show`, `config path`, and `config set` commands for
  inspecting and updating the YAML configuration.
- `run` command to create and push a cycle of commits in one shot.
- `run --schedule` (alias `--daemon`) foreground scheduler that creates one
  commit per daily event.
- `status` command showing repository, configuration, and schedule state.
- `logs` command reading recent entries from the GitPulse log file.
- `validate` command reporting configuration problems with fixes.
- `doctor` command running environment and configuration health checks.
- `version` command and `--version` flag.
- Human-readable YAML configuration stored at `~/.gitpulse/config.yaml`.
- Isolated commit strategy writing only to `.gitpulse/activity.log`.
- Daily scheduler supporting even spread or fixed commit intervals.
- Structured logging via logrus to console and `~/.gitpulse/gitpulse.log`.
- Dry-run mode with full simulation of a commit cycle.
- Unit, integration, and CLI smoke tests across all packages.
- `scripts/build.sh`, `scripts/install.sh`, and `scripts/test.sh`.
- GitHub Actions CI workflow.
- Documentation: README, architecture, configuration, and CLI reference.

### Security

- All git commands run without a shell; arguments are passed directly to
  `exec`, preventing command injection.
- Configuration file is written with `0600` permissions and the directory
  with `0700`.

[1.0.0]: https://github.com/gitpulse/gitpulse/releases/tag/v1.0.0
