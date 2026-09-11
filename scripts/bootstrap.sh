#!/usr/bin/env bash
# GitPulse bootstrap installer for Linux and macOS.
#
# Safe/idempotent baseline setup:
#   1. verifies/installs Git only when missing;
#   2. reuses a compatible system Go, otherwise reuses or installs a private Go toolchain;
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
  --upgrade-deps   Explicitly upgrade Go module dependencies after the safe
                   baseline bootstrap. This may change go.mod/go.sum.

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

sha256_file() {
  if need_command sha256sum; then
    sha256sum "$1" | awk '{print $1}'
  elif need_command shasum; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    die "sha256sum or shasum is required to verify the Go toolchain."
  fi
}

official_go_checksum() {
  local archive_name="$1" manifest
  manifest="$2"
  curl -fsSL --retry 3 --retry-delay 2 'https://go.dev/dl/?mode=json&include=all' -o "$manifest"
  # The official download manifest is JSON. Avoid a jq dependency while
  # matching the exact file name and its published SHA-256 field.
  awk -v filename="$archive_name" '
    BEGIN { RS="{" }
    index($0, "\"filename\":\"" filename "\"") {
      if (match($0, /\"sha256\":\"[0-9a-f]{64}\"/)) {
        value = substr($0, RSTART, RLENGTH)
        gsub(/\"sha256\":\"|\"/, "", value)
        print value
        exit
      }
    }
  ' "$manifest"
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

private_go_root() {
  printf '%s/toolchains/go%s' "$INSTALL_ROOT" "$REQUIRED_GO"
}

use_private_go_if_available() {
  local root="$(private_go_root)"
  if [ -x "${root}/bin/go" ]; then
    export GOROOT="$root"
    export PATH="$GOROOT/bin:$PATH"
    say "Reusing private Go: $(go version)"
    return 0
  fi
  return 1
}

ensure_go() {
  if need_command go; then
    local current
    current="$(go version | sed -E 's/^go version go([^ ]+).*/\1/')"
    if version_ge "$current" "$REQUIRED_GO"; then
      say "Compatible system Go detected: $(go version)"
      return
    fi
    echo "System Go ${current} is older than required ${REQUIRED_GO}."
  else
    echo "Go is not installed."
  fi

  if use_private_go_if_available; then
    return
  fi

  local archive_name url archive_dir tmp archive manifest expected actual candidate backup
  archive_name="$(go_archive_name)"
  url="https://go.dev/dl/go${REQUIRED_GO}.${archive_name#go}"
  archive_dir="$(private_go_root)"
  mkdir -p "${INSTALL_ROOT}/toolchains"
  tmp="$(mktemp -d "${INSTALL_ROOT}/toolchains/.gitpulse-go.XXXXXX")"
  archive="${tmp}/go.tar.gz"
  manifest="${tmp}/go-downloads.json"
  candidate="${tmp}/go"

  say "Downloading Go ${REQUIRED_GO} from go.dev"
  curl -fL --retry 3 --retry-delay 2 "$url" -o "$archive"
  expected="$(official_go_checksum "$archive_name" "$manifest")"
  [ -n "$expected" ] || die "official Go checksum for ${archive_name} was not found"
  actual="$(sha256_file "$archive")"
  [ "$actual" = "$expected" ] || die "Go checksum mismatch for ${archive_name}; download was discarded"

  mkdir -p "$candidate"
  tar -xzf "$archive" -C "$candidate" --strip-components=1
  [ -x "${candidate}/bin/go" ] || die "downloaded Go archive did not contain bin/go"
  "${candidate}/bin/go" version | grep -q "go${REQUIRED_GO}" || die "downloaded Go version did not match ${REQUIRED_GO}"

  # Do not remove a working toolchain until the replacement has been
  # downloaded, verified, extracted, and executed successfully.
  backup="${archive_dir}.previous"
  rm -rf "$backup"
  if [ -e "$archive_dir" ]; then
    mv "$archive_dir" "$backup"
  fi
  if ! mv "$candidate" "$archive_dir"; then
    [ -e "$backup" ] && mv "$backup" "$archive_dir"
    die "could not activate the verified Go toolchain; previous toolchain was restored"
  fi
  rm -rf "$backup"
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
