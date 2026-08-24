<div align="center">
  <img src="assets/gitpulse-hero.svg" alt="GitPulse — automate, commit, push, repeat" width="100%">
</div>

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

Developed by **BLACKSAUCE**

---

## Features

- **Interactive quick-run mode** — run `gitpulse` with no arguments and it
  walks you through repository path, commit count, interval, and message.
- Auto-detects Git repository in current directory and offers it as default.
- Smart repository path resolution: absolute paths, relative paths, `~`
  expansion, paths with spaces, and single-word folder names.
- Home-directory fallback: type a folder name like `Tatme` and GitPulse will
  automatically check `~/Tatme` if it doesn't exist in the current directory.
- Shell-command protection: inputs like `pwd`, `ls`, `cd`, `git status` are
  rejected with a helpful hint instead of being treated as paths.
- Pre-commit `git pull` syncs the local repository with the remote before
  any automated commits are created.
- README.md validation: warns if missing, offers to create one automatically.
- Dirty working tree protection: refuses to run if uncommitted changes exist.
- Detached HEAD detection: stops safely instead of creating commits in an
  ambiguous state.
- Bare repository detection: explains why GitPulse needs a working tree.
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

### Recommended: bootstrap installer

GitPulse is designed so a new machine does not need a manually assembled Go
environment. The bootstrap installer checks the host, installs only missing
prerequisites where supported, reuses a compatible system Go, provisions a
private Go toolchain only when needed, downloads the dependencies declared by
the project, builds GitPulse, installs it, and runs `gitpulse doctor` as a
post-install health gate.

**Linux / macOS:**

```sh
git clone https://github.com/dinalegw/GitPulse.git
cd GitPulse
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh
```

**Windows PowerShell:**

```powershell
git clone https://github.com/dinalegw/GitPulse.git
cd GitPulse
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\bootstrap.ps1
```

The default bootstrap path:

- requires Git for repository operations and installs it only when it is
  missing and automatic installation is supported;
- uses Go 1.26.3 or newer;
- **does not downgrade a newer compatible Go installation**;
- reuses an existing private Go 1.26.3 toolchain instead of downloading it
  again;
- downloads the exact dependency versions declared by `go.mod`/`go.sum`;
- builds a native GitPulse binary for the current machine;
- installs it under `~/.local/bin` by default;
- verifies the installation with `gitpulse version` and `gitpulse doctor`.

The normal bootstrap path is intentionally **idempotent and non-destructive**:
running it again on an already prepared laptop should reuse compatible tools
instead of blindly upgrading or replacing them. It does not automatically
upgrade unrelated operating-system packages or module dependencies.

For an explicit dependency upgrade during bootstrap:

```sh
./scripts/bootstrap.sh --upgrade-deps
```

or on Windows:

```powershell
.\scripts\bootstrap.ps1 -UpgradeDeps
```

Dependency upgrades are deliberately opt-in. A reliable installer should
make the machine compatible first and reproducible second rather than blindly
upgrading unrelated packages.

See [docs/installation.md](docs/installation.md) for the complete
cross-platform installation and troubleshooting guide.

### From an existing Go checkout

If Go 1.26.3+ and Git are already installed:

```sh
go mod download
./scripts/build.sh
./scripts/install.sh
```
