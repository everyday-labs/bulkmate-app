#!/usr/bin/env sh
# Secret scanning with gitleaks (.gitleaks.toml extends the built-in rules).
#   scripts/secret-scan.sh --staged   staged changes only (pre-commit hook)
#   scripts/secret-scan.sh            every commit on every branch (pre-push, CI)
# Fails closed: a missing scanner blocks the commit rather than skipping it.
set -e
root="$(git rev-parse --show-toplevel)"
cd "$root"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "✖ gitleaks is not installed, so secrets can't be checked." >&2
  echo "  Install it: brew install gitleaks  (or see https://github.com/gitleaks/gitleaks#installing)" >&2
  exit 1
fi

if [ "$1" = "--staged" ]; then
  gitleaks git --staged --pre-commit --config .gitleaks.toml --redact --no-banner --verbose
else
  gitleaks git . --log-opts="--all" --config .gitleaks.toml --redact --no-banner
fi
