# Contributing to GitPulse

Thank you for considering contributing to GitPulse. This project aims for
production-quality engineering: clean architecture, meaningful tests, and
clear documentation.

## Code of conduct

Be respectful and constructive. We do not accept contributions that promote
using GitPulse to deceive GitHub, fake development activity, or otherwise
misrepresent repository history.

## How to contribute

1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/my-change`).
3. Make your change following the standards below.
4. Add or update tests and documentation.
5. Run the checks: `./scripts/test.sh`.
6. Commit with a conventional commit message.
7. Open a pull request describing the change and the reasoning behind it.

## Development setup

Requirements: Go 1.24+ and `git`.

```sh
./scripts/test.sh    # go vet + go test ./...
./scripts/build.sh   # build to bin/gitpulse
```

## Standards

- Follow the project architecture: CLI, configuration, git, commits,
  scheduler, logger, validation, utils. Keep packages focused and avoid
  circular dependencies.
- Every exported identifier must have a Go documentation comment.
- Small functions, single responsibility, no duplicated logic.
- No panics for user-facing failures; return meaningful errors that explain
  what failed, why, and how to fix it.
- New features require tests (unit, and integration where practical).
- Update `docs/` and the README when behavior changes.
- Do not leave TODO placeholders or unfinished implementations.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add --once flag to run
fix: handle detached HEAD in status
docs: document commit_interval_minutes
test: cover empty schedule window
chore: bump Go version in CI
```

## Reporting bugs

Open an issue with:

- The GitPulse version (`gitpulse version`).
- Your operating system.
- The command you ran and its full output.
- Expected vs. actual behavior.

## Security vulnerabilities

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).
