#!/usr/bin/env sh
# Runs a lint tool if it's installed locally, otherwise warns and passes —
# CI installs and enforces it either way. Secrets are different: see
# scripts/secret-scan.sh, which fails closed.
#   scripts/optional-tool.sh actionlint
#   scripts/optional-tool.sh shellcheck scripts/foo.sh
tool="$1"
shift
if command -v "$tool" >/dev/null 2>&1; then
  exec "$tool" "$@"
fi
echo "⚠ $tool not installed — skipped locally (CI still runs it). Install: brew install $tool" >&2
