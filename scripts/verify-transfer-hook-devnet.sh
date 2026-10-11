#!/usr/bin/env bash
# Public read-only verification. No wallet, signing or deployment.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: bash scripts/verify-transfer-hook-devnet.sh PROGRAM_ID REVIEWED_CODE_FINGERPRINT [EXPECTED_UPGRADE_AUTHORITY]"
  exit 1
fi
python3 "$root/scripts/hook-artifact.py" verify "$@"