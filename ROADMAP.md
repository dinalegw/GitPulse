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

## v1.1 (planned)

- Multiple repository support.
- Randomized intervals within the configured window.
- Interactive setup wizard.
- Improved CLI output and formatting.

## v2.0 (future)

- Web dashboard.
- GitHub OAuth.
- Cloud scheduler and hosted workers (the `Scheduler` interface is designed
  for this).
- Contribution analytics.

## Guiding principles

GitPulse must remain transparent and user-controlled. It automates
user-configured Git operations; it does not fake development activity. The
scheduler implementation is deliberately modular so future platform
schedulers can be added without restructuring the core.
