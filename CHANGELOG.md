# Changelog

All notable changes to GitPulse are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
