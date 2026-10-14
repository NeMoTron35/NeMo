#!/usr/bin/env bash
# Opt-in local verification of the research QuantumQLi transfer hook. No network writes.
#   QLI_RUN_RUST_HOOK_TESTS=1 bash scripts/check-transfer-hook.sh
set -euo pipefail
if [ "${QLI_RUN_RUST_HOOK_TESTS:-}" != "1" ]; then echo "SKIPPED: set QLI_RUN_RUST_HOOK_TESTS=1"; exit 0; fi
root="$(cd "$(dirname "$0")/.." && pwd)"
(cd "$root/programs/quantum_transfer_hook" && cargo test --features no-entrypoint)
(cd "$root/programs/quantum_transfer_hook_cpi_test" && cargo test)
echo "Transfer hook unit + Token-2022 BanksServer CPI tests passed (local only, not deployed)."