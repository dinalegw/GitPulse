# GitPulse Installation

GitPulse is a Go CLI, but users should not have to manually assemble a development environment just to install it.

The supported installation path is the **bootstrap installer**. It checks the host, installs missing prerequisites where the operating system allows it, reuses compatible tools that are already installed, provisions a compatible Go toolchain only when needed, downloads the dependencies declared by `go.mod`, builds GitPulse, installs it, and runs `gitpulse doctor` as a post-install gate.

## Linux and macOS

Clone the repository and run the bootstrap script:

```sh
git clone https://github.com/dinalegw/GitPulse.git
cd GitPulse
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh
```

The installer:

1. verifies Git;
2. installs Git with a supported package manager only when Git is missing;
3. verifies Go 1.26.3 or newer;
4. reuses a compatible system Go without downgrading it;
5. reuses a previously downloaded private Go 1.26.3 toolchain when one already exists;
6. installs a private Go 1.26.3 toolchain under `~/.gitpulse/toolchains` when the system Go is missing or too old and no private toolchain exists;
7. downloads the exact module versions recorded by `go.mod`/`go.sum`;
8. builds GitPulse for the current platform;
9. installs the binary to `~/.local/bin`;
10. runs `gitpulse version` and `gitpulse doctor`.

The default path is intentionally **idempotent and non-destructive**. Running it again should reuse compatible software instead of blindly replacing or upgrading it.

To explicitly upgrade module dependencies during bootstrap:

```sh
./scripts/bootstrap.sh --upgrade-deps
```

This is deliberately opt-in. A bootstrap should be reproducible by default; blindly upgrading every dependency can introduce untested breaking changes.

### Custom installation directory

```sh
PREFIX=/usr/local/bin ./scripts/bootstrap.sh
```

Use a directory you have permission to write to, or run the command with the appropriate system permissions.

## Windows

Open PowerShell in the cloned repository:

```powershell
git clone https://github.com/dinalegw/GitPulse.git
cd GitPulse
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\bootstrap.ps1
```

The Windows bootstrap:

- installs Git with `winget` or Chocolatey only when Git is missing;
- reuses compatible system Go without downgrading it;
- reuses a previously downloaded private Go toolchain when available;
- installs a private Go 1.26.3 toolchain when the system Go is missing/too old;
- supports Windows AMD64 and ARM64;
- downloads the declared Go modules;
- builds a native `gitpulse.exe` without requiring Git Bash;
- adds the install directory to the user's PATH without discarding existing PATH entries;
- runs the version and doctor checks.

For dependency upgrades:

```powershell
.\scripts\bootstrap.ps1 -UpgradeDeps
```

## From an existing Go checkout

If Go 1.26.3+ and Git are already installed:

```sh
go mod download
./scripts/build.sh
./scripts/install.sh
```

On Windows, use `go mod download` and the native build logic in `scripts/bootstrap.ps1` rather than executing the Unix `build.sh` script directly from PowerShell.

## Runtime requirements

The installed GitPulse binary does **not** need Go at runtime. It does need Git because GitPulse deliberately delegates Git repository operations to the system Git executable.

Run:

```sh
gitpulse doctor
```

to verify the runtime environment and configured repository.

## Why bootstrap does not blindly update everything

"Update everything" sounds safe but is not a reliable installation strategy. The bootstrap process makes the environment compatible first and reproducible second:

- a compatible Go installation is reused;
- the required Go minimum is enforced without downgrading newer compatible versions;
- the dependency versions in `go.mod`/`go.sum` are used by default;
- dependency upgrades are available through an explicit opt-in flag;
- destructive or unrelated system upgrades are never performed automatically.

This prevents a new dependency release or an operating-system package upgrade from unexpectedly changing GitPulse behavior during installation.

## Troubleshooting

### `go` is not found

Use the bootstrap installer. It provisions a private Go toolchain when the system does not have a compatible version.

### `git` is not found

Use the bootstrap installer. If the operating system has no supported package manager available, install Git manually and rerun the bootstrap.

### `gitpulse` is installed but not found

The default install location is `~/.local/bin`. Add it to your PATH and open a new terminal if necessary.

On Windows the bootstrap adds the configured install directory to the user's PATH; open a new PowerShell session after installation.

### `doctor` reports a repository problem

This is normally a configuration or repository-state issue rather than an installation failure. Run:

```sh
gitpulse doctor
gitpulse validate
```

Then follow the reported remediation steps.
