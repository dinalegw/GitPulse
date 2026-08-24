#!/usr/bin/env bash
#
# Build and install GitPulse.
#
# Installs to ~/.local/bin (default) or to the directory given by PREFIX.
# If Git or a compatible Go toolchain is missing, hand off to bootstrap.sh.
set -euo pipefail

cd "$(dirname "$0")/.."

PREFIX="${PREFIX:-${HOME}/.local/bin}"

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

if ! command -v git >/dev/null 2>&1 || ! command -v go >/dev/null 2>&1; then
  exec ./scripts/bootstrap.sh
fi

current_go="$(go version | sed -E 's/^go version go([^ ]+).*/\1/')"
if ! version_ge "$current_go" "1.26.3"; then
  exec ./scripts/bootstrap.sh
fi

mkdir -p "$PREFIX"
go mod download
./scripts/build.sh "${PREFIX}/gitpulse"

echo "installed to ${PREFIX}/gitpulse"
echo "ensure ${PREFIX} is on your PATH, then run: gitpulse doctor"
