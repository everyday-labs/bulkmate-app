#!/usr/bin/env sh
# Runs Deno from costco-backend/supabase/functions, using a local install when
# present and falling back to the npm-distributed binary otherwise.
set -e
cd "$(git rev-parse --show-toplevel)/costco-backend/supabase/functions"
if command -v deno >/dev/null 2>&1; then
  exec deno "$@"
else
  exec npx --yes deno "$@"
fi
