#!/usr/bin/env bash
#
# Build GitPulse for the current platform.
#
# Usage:
#   ./scripts/build.sh [output-path]
#
# The default output path is bin/gitpulse.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="${1:-bin/gitpulse}"
VERSION="$(tr -d '[:space:]' < VERSION)"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$(dirname "$OUT")"

go build \
  -trimpath \
  -ldflags "-s -w \
    -X github.com/gitpulse/gitpulse/internal/version.Version=${VERSION} \
    -X github.com/gitpulse/gitpulse/internal/version.Commit=${COMMIT} \
    -X github.com/gitpulse/gitpulse/internal/version.Date=${DATE}" \
  -o "$OUT" .

echo "built $OUT"
echo "  version: ${VERSION}"
echo "  commit:  ${COMMIT}"
