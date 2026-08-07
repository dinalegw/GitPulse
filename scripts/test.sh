#!/usr/bin/env bash
#
# Run static checks and the full test suite.
#
# Usage:
#   ./scripts/test.sh            # vet + test
#   ./scripts/test.sh -cover     # vet + test with coverage
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> gofmt"
FILES="$(gofmt -l ./cmd ./internal main.go)"
if [ -n "$FILES" ]; then
  echo "gofmt needed on:"
  echo "$FILES"
  exit 1
fi

echo "==> go vet"
go vet ./...

echo "==> go test"
go test ./... "$@"

echo "all checks passed"
