#!/usr/bin/env sh
# Runs a command from costco-mobile/ (used by lint-staged, which runs from the
# repo root and appends absolute file paths as separate arguments).
set -e
cd "$(git rev-parse --show-toplevel)/costco-mobile"
exec "$@"
