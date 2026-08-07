#!/usr/bin/env bash
#
# Build and install GitPulse.
#
# Installs to ~/.local/bin (default) or to the directory given as the first
# argument, for example /usr/local/bin.
set -euo pipefail

cd "$(dirname "$0")/.."

PREFIX="${PREFIX:-${HOME}/.local/bin}"
mkdir -p "$PREFIX"

./scripts/build.sh "${PREFIX}/gitpulse"

echo "installed to ${PREFIX}/gitpulse"
echo "ensure ${PREFIX} is on your PATH, then run: gitpulse doctor"
