#!/usr/bin/env sh
# Runs the Edge Function tests with coverage and fails if line coverage is
# below DENO_COVERAGE_MIN (default 90 — ratchet up, never down). Writes .cov/lcov.info for CI artifacts.
set -e
root="$(git rev-parse --show-toplevel)"
min="${DENO_COVERAGE_MIN:-90}"
dir="$root/.cov"
rm -rf "$dir"

"$root/scripts/deno.sh" test --allow-env --allow-read --coverage="$dir"
exclude='(test\.(ts|tsx|js)$)|(/_testing/)'
report="$("$root/scripts/deno.sh" coverage "$dir" --exclude="$exclude" 2>&1 | sed 's/\x1b\[[0-9;]*m//g')"
"$root/scripts/deno.sh" coverage "$dir" --exclude="$exclude" --lcov --output="$dir/lcov.info" >/dev/null 2>&1
echo "$report"

line="$(echo "$report" | awk -F'|' '/All files/ { gsub(/ /, "", $5); print $5 }')"
if [ -z "$line" ]; then
  echo "✖ Could not read line coverage from deno coverage output" >&2
  exit 1
fi
if awk -v l="$line" -v m="$min" 'BEGIN { exit !(l + 0 < m + 0) }'; then
  echo "✖ Edge Function line coverage ${line}% is below the ${min}% minimum" >&2
  exit 1
fi
echo "✔ Edge Function line coverage ${line}% (minimum ${min}%)"
