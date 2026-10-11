#!/usr/bin/env bash
# Runtime CLI configuration must not use browser-only declaration aliases.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
command -v node >/dev/null || { echo "Node.js is required for the isolated CLI runtime."; exit 1; }
runtime=$(mktemp "$root/scripts/.hook-e2e-XXXXXX.mjs")
trap 'rm -f "$runtime"' EXIT
bun build "$root/scripts/e2e-hook-dbc-devnet.ts" --target=node --packages=external --outfile="$runtime" >/dev/null
node "$runtime" "$@"