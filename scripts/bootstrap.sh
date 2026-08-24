#!/usr/bin/env bash
# GitPulse bootstrap installer for Linux and macOS.
#
# Idempotent baseline setup:
#   1. verifies/installs Git;
#   2. verifies Go 1.26.3+ or installs a private Go 1.26.3 toolchain;
#   3. downloads the exact dependencies declared by go.mod;
#   4. builds GitPulse;
#   5. installs it to ~/.local/bin (or PREFIX);
#   6. runs version + doctor as a post-install gate.
set -euo pipefail

REQUIRED_GO="1.26.3"
INSTALL_ROOT="${GITPULSE_INSTALL_ROOT:-${HOME}/.gitpulse}"
PREFIX="${PREFIX:-${HOME}/.local/bin}"
UPGRADE_DEPS=0

usage() {
  cat <<'EOF'
GitPulse bootstrap installer

Usage:
  ./scripts/bootstrap.sh [--upgrade-deps]

Options:
  --upgrade-deps   Upgrade Go module dependencies after the safe baseline
                   bootstrap. This may change go.mod/go.sum.

Environment:
  PREFIX                 Install directory (default ~/.local/bin)
  GITPULSE_INSTALL_ROOT  Private toolchain/cache directory (default ~/.gitpulse)
EOF
}

for arg in "$@"; do
  case "$arg" in
    --upgrade-deps) UPGRADE_DEPS=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Error: unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

say() { printf '\n==> %s\n' "$*"; }
die() { echo "Error: $*" >&2; exit 1; }
need_command() { command -v "$1" >/dev/null 2>&1; }

version_ge() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    split(a, A, "."); split(b, B, ".");
    for (i = 1; i <= 3; i++) {
      av = (A[i] == "" ? 0 : A[i]) + 0;
      bv = (B[i] == "" ? 0 : B[i]) + 0;
      if (av > bv) exit 0;
      if (av < bv) exit 1;
    }
    exit 0;
  }'
}

install_linux_packages() {
  if need_command apt-get; then
    sudo apt-get update
    sudo apt-get install -y git ca-certificates curl tar
  elif need_command dnf; then
    sudo dnf install -y git ca-certificates curl tar
  elif need_command yum; then
    sudo yum install -y git ca-certificates curl tar
  elif need_command pacman; then
    sudo pacman -Sy --needed --noconfirm git ca-certificates curl tar
  elif need_command apk; then
    sudo apk add --no-cache git ca-certificates curl tar
  elif need_command zypper; then
    sudo zypper --non-interactive install git ca-certificates curl tar
  else
    die "No supported Linux package manager found. Install Git and curl, then rerun this script."
  fi
}

ensure_git() {
  if need_command git; then
    say "Git detected: $(git --version)"
    return
  fi

  say "Git is missing; installing it"
  case "$(uname -s)" in
    Linux)
      install_linux_packages
      ;;
    Darwin)
      if need_command brew; then
        brew install git
      else
        xcode-select --install || true
        die "Finish the Xcode Command Line Tools installation, then rerun this script."
      fi
      ;;
    *)
      die "Unsupported Unix platform: $(uname -s)"
      ;;
  esac

  need_command git || die "Git installation completed but git is still not on PATH."
  say "Git ready: $(git --version)"
}

ensure_curl() {
  need_command curl && return
  if [ "$(uname -s)" = "Linux" ]; then
    install_linux_packages
  fi
  need_command curl || die "curl is required to bootstrap the toolchain."
}

go_archive_name() {
  local os arch
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    *) die "Unsupported platform: $(uname -s)" ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) die "Unsupported CPU architecture: $(uname -m)" ;;
  esac
  printf 'go%s-%s.tar.gz' "$os" "$arch"
}

ensure_go() {
  if need_command go; then
    local current
    current="$(go version | sed -E 's/^go version go([^ ]+).*/\1/')"
    if version_ge "$current" "$REQUIRED_GO"; then
      say "Go detected: $(go version)"
      return
    fi
    echo "System Go ${current} is older than required ${REQUIRED_GO}; using a private toolchain."
  else
    echo "Go is not installed; installing a private ${REQUIRED_GO} toolchain."
  fi

  local archive_name url archive_dir tmp archive
  archive_name="$(go_archive_name)"
  url="https://go.dev/dl/go${REQUIRED_GO}.${archive_name#go}"
  archive_dir="${INSTALL_ROOT}/toolchains/go${REQUIRED_GO}"
  tmp="$(mktemp -d)"
  archive="${tmp}/go.tar.gz"
  mkdir -p "${INSTALL_ROOT}/toolchains"

  say "Downloading Go ${REQUIRED_GO} from go.dev"
  curl -fL --retry 3 --retry-delay 2 "$url" -o "$archive"
  rm -rf "$archive_dir"
  mkdir -p "$archive_dir"
  tar -xzf "$archive" -C "$archive_dir" --strip-components=1
  rm -rf "$tmp"

  export GOROOT="$archive_dir"
  export PATH="$GOROOT/bin:$PATH"
  say "Using private Go: $(go version)"
}

ensure_go_modules() {
  say "Downloading exact module dependencies declared by go.mod"
  go mod download

  if [ "$UPGRADE_DEPS" -eq 1 ]; then
    say "Upgrading module dependencies (explicitly requested)"
    go get -u ./...
    go mod tidy
  fi
}

build_and_install() {
  say "Building GitPulse"
  mkdir -p "$PREFIX"
  ./scripts/build.sh "${PREFIX}/gitpulse"
  say "Installed GitPulse to ${PREFIX}/gitpulse"
  if [[ ":${PATH}:" != *":${PREFIX}:"* ]]; then
    echo "Add ${PREFIX} to PATH if it is not already present."
  fi
}

main() {
  case "$(uname -s)" in
    Linux|Darwin) ;;
    *) die "This script supports Linux and macOS. On Windows use scripts/bootstrap.ps1." ;;
  esac

  ensure_git
  ensure_curl
  ensure_go
  ensure_go_modules
  build_and_install

  say "Running installation health check"
  "${PREFIX}/gitpulse" version
  echo
  if ! "${PREFIX}/gitpulse" doctor; then
    echo "GitPulse installed, but doctor reported an environment/configuration issue." >&2
    echo "Fix the reported issue and run: gitpulse doctor" >&2
    exit 1
  fi

  echo
  echo "GitPulse bootstrap completed successfully."
}

main "$@"
