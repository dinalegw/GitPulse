# Roadmap

GitPulse follows Semantic Versioning. This roadmap covers the current and
planned directions.

## v1.0.0 — Released

- CLI application with `init`, `config`, `run`, `status`, `logs`,
  `validate`, `version`, and `doctor` commands.
- Repository selection and human-readable YAML configuration.
- Isolated commit strategy using a `.gitpulse/` metadata directory.
- Automatic staging, commit creation, and a single push per cycle.
- Dry-run mode.
- Daily foreground scheduler (even spread or fixed interval).
- Structured logging and validation with actionable fixes.
- Cross-platform support (Windows, macOS, Linux).
- Public documentation site and browser playground for safe, disposable
  exploration.
- Optional GitHub App identity connection for the website; it does not run the
  local CLI or write to user repositories.

## v1.1 (planned)

- Multiple repository support.
- Randomized intervals within the configured window.
- Interactive setup wizard.
- Improved CLI output and formatting.
- Installer recovery and integrity coverage across supported platforms.

## Longer-term exploration

- Better local workflow templates and configuration ergonomics.
- Optional integrations that preserve local execution and explicit user
  authorization.

## Guiding principles

GitPulse must remain transparent and user-controlled. It automates
user-configured Git operations; it does not fake development activity or
promise GitHub contribution credit. Any hosted repository-write or scheduling
service would need its own verified security, privacy, and operational design
before it could be described as available.
