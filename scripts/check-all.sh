#!/usr/bin/env sh
# Full quality gate — the same checks CI runs. Used by the pre-push hook;
# run it manually before opening a PR: ./scripts/check-all.sh
set -e
root="$(git rev-parse --show-toplevel)"

echo "▶ Formatting (Prettier)"
# Tracked files only: what is pushed is committed, and unrelated untracked
# work-in-progress must not block a push.
(cd "$root" && git ls-files -z | xargs -0 costco-mobile/node_modules/.bin/prettier --check --ignore-unknown --log-level warn)

echo "▶ Mobile: lint, typecheck, contrast, tests + coverage"
(cd "$root/costco-mobile" && npm run -s lint && npm run -s typecheck && npm run -s check:contrast >/dev/null && CI=1 npm run -s test:coverage -- --silent)

echo "▶ Edge Functions: check, lint, tests + coverage"
"$root/scripts/deno.sh" check .
"$root/scripts/deno.sh" lint
"$root/scripts/deno-coverage.sh"

echo "✔ All checks passed"
