<div align="center">
  <img src="assets/gitpulse-hero.svg" alt="GitPulse — safe Git repository automation" width="100%">
</div>

# GitPulse

**Safe, cross-platform Git repository automation from the command line.**

GitPulse helps developers automate routine Git workflows with repository validation, dry runs, scheduling, controlled commits, and explicit push behavior — while keeping execution local and user-controlled.

**For developers who want repeatable Git workflows without handing a third-party service their repository credentials.**

[![Go](https://img.shields.io/badge/Go-1.26%2B-00ADD8?logo=go)](https://go.dev/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Sponsor](https://img.shields.io/badge/Sponsor-GitHub-30363D?logo=githubsponsors)](https://github.com/sponsors/dinalegw)

> **Responsible use:** GitPulse automates Git operations you configure. It is not a tool for deceiving GitHub or fabricating development activity. Use automation only for legitimate repository workflows, and ensure generated changes accurately represent meaningful work.

**Developed by BLACKSAUCE**

---

## Why GitPulse?

Git automation should be predictable before it is powerful.

- **Validation first** — checks repository state before automated changes.
- **Dry-run support** — preview a cycle without modifying the repository.
- **Controlled push workflow** — commit and push only through the configured Git workflow.
- **Local-first** — no telemetry or GitHub API dependency for core CLI operation.
- **Cross-platform** — Windows, macOS, and Linux.
- **Built-in diagnostics** — `doctor`, `validate`, `status`, and `logs` make failures visible.
- **Human-readable configuration** — YAML configuration you can inspect and manage.
- **Scoped automation** — generated metadata is kept separate from source files.

## Is GitPulse for you?

Use GitPulse when you want to run a deliberate, reviewable Git workflow in a repository you own: for example, a recurring metadata update, a scheduled maintenance task, or a repeatable commit cycle that you have configured and tested with `--dry-run`.

GitPulse is not a hosted GitHub bot, a replacement for normal code review, or a way to manufacture contribution activity. It runs locally and uses the Git authentication already configured on the user's computer.

## Try GitPulse in your browser

**No installation required.** The project includes a browser playground that runs the real GitPulse binary inside an ephemeral sandbox.

**[Open the GitPulse Playground](https://start-gitpulse.vercel.app/playground)** · **[Explore the Docs](https://start-gitpulse.vercel.app/docs)**

The playground is for exploration and uses only a disposable demo repository. GitHub sign-in is optional and currently verifies identity plus available GitHub App installations; it does not run GitPulse against a user repository. To operate on your own repository today, install the local CLI and use your existing Git credentials.

## Install

### Recommended: bootstrap installer

The bootstrap installer checks the host, reuses a compatible Go installation, installs only missing supported prerequisites, verifies a downloaded private Go toolchain against Go's official SHA-256 manifest before activation, builds GitPulse for the current machine, and verifies the installation with `gitpulse version` and `gitpulse doctor`.

**Linux / macOS**

```sh
git clone https://github.com/dinalegw/GitPulse.git
cd GitPulse
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh
```

**Windows PowerShell**

```powershell
git clone https://github.com/dinalegw/GitPulse.git
cd GitPulse
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\bootstrap.ps1
```

The bootstrap path is intentionally idempotent and non-destructive: it does not blindly downgrade compatible tools or upgrade unrelated operating-system packages.

See [docs/installation.md](docs/installation.md) for troubleshooting and platform details.

## Quick start

From the repository you want GitPulse to operate on (not necessarily the GitPulse source checkout):

```sh
gitpulse init
gitpulse doctor
gitpulse run --dry-run
gitpulse run
```

For a complete command reference, see the [CLI documentation](docs/cli.md).

## What GitPulse automates

GitPulse can configure and execute repository workflows including:

- repository detection and validation;
- remote and branch checks;
- scheduled runs;
- controlled commit generation;
- Git staging and commits;
- explicit push workflows;
- dry-run simulation;
- structured activity logs;
- health and status diagnostics.

GitPulse is deliberately transparent: it does not promise or manufacture GitHub contribution credit. GitHub determines contribution attribution based on its own rules and the commit author email.

## Sponsor GitPulse

If GitPulse is useful to you, you can support its maintenance through [GitHub Sponsors](https://github.com/sponsors/dinalegw). Sponsorship is optional and does not unlock or restrict the local CLI.

## For contributors

Clone the repository when you want to inspect, modify, test, or contribute to GitPulse itself.

```sh
git clone https://github.com/dinalegw/GitPulse.git
cd GitPulse
./scripts/bootstrap.sh
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [developer documentation](https://start-gitpulse.vercel.app/docs) for the development workflow.

## Web platform

The `gitpulse-website/` directory contains the public website, browser playground, and optional GitHub identity connection. Authenticated hosted repository automation is a future capability and is not shipped by this repository; see [docs/open-source-boundary.md](docs/open-source-boundary.md).

**Live site:** https://start-gitpulse.vercel.app/

## Documentation

- [Architecture](docs/architecture.md)
- [CLI reference](docs/cli.md)
- [Configuration](docs/configuration.md)
- [Installation](docs/installation.md)
- [GitHub push workflow](docs/github-push.md)
- [GitHub integration](docs/github-integration.md)
- [Playground architecture](docs/playground.md)
- [Privacy](docs/privacy.md)
- [Monetization](docs/monetization.md)
- [Open-source boundary](docs/open-source-boundary.md)

## License

MIT — see [LICENSE](LICENSE).
