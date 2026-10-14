#!/usr/bin/env bash
# OWNER-ONLY. No dependency installs, no mainnet, no finalization, no automatic unknown upgrades.
# QLI_HOOK_SO=/absolute/quantum_transfer_hook.so [QLI_HOOK_SHA256=/absolute/checksum-file]
# Checksum default: exactly one of <so>.sha256 (local build) or <dir>/<name>.sha256 (PR #16 zip) must exist.
# bash scripts/deploy-transfer-hook-devnet.sh [~/qli-hook-program.json]
set -euo pipefail
URL=https://api.devnet.solana.com
root="$(cd "$(dirname "$0")/.." && pwd -P)"
SO="${QLI_HOOK_SO:-$root/programs/quantum_transfer_hook/target/deploy/quantum_transfer_hook.so}"
case "$SO" in /*) ;; *) echo "Refusing: QLI_HOOK_SO must be an absolute path."; exit 1;; esac
if [ -n "${QLI_HOOK_SHA256:-}" ]; then
  SHA="$QLI_HOOK_SHA256"
else
  A="$SO.sha256"; B="${SO%.so}.sha256"
  if [ -f "$A" ] && [ -f "$B" ] && [ "$A" != "$B" ]; then
    echo "Refusing: both $A and $B exist; set QLI_HOOK_SHA256 explicitly."; exit 1
  elif [ -f "$A" ]; then SHA="$A"
  elif [ -f "$B" ]; then SHA="$B"
  else echo "Refusing: no checksum file found; set QLI_HOOK_SHA256. Checksum is never skipped."; exit 1
  fi
fi
case "$SHA" in /*) ;; *) echo "Refusing: QLI_HOOK_SHA256 must be an absolute path."; exit 1;; esac
REPORT=$(python3 "$root/scripts/hook-artifact.py" artifact "$SO" "$SHA")
SO=$(printf '%s' "$REPORT" | python3 -c 'import json,sys;print(json.load(sys.stdin)["artifact"])')
FP=$(printf '%s' "$REPORT" | python3 -c 'import json,sys;print(json.load(sys.stdin)["codeFingerprint"])')
echo "$REPORT"
command -v solana >/dev/null || { echo "Install reviewed Solana CLI on your own computer first."; exit 1; }
[ -t 0 ] || { echo "Refusing: owner must approve interactively on their own computer."; exit 1; }
KP_IN="${1:-$HOME/qli-hook-program.json}"
KP=$(python3 -c 'from pathlib import Path;import sys;p=Path(sys.argv[1]).expanduser().resolve();assert p.parent.is_dir();print(p)' "$KP_IN")
case "$KP" in "$root"|"$root"/*) echo "Refusing: keep the program keypair outside the repository."; exit 1;; esac
G=$(solana genesis-hash -u "$URL")
[ "$G" = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG" ] || { echo "Refusing: not devnet."; exit 1; }
ME=$(solana address)
echo "Payer / upgrade authority: $ME; balance: $(solana balance -u "$URL")"
# solana-keygen prints a recovery phrase. Redirect it to /dev/null; never collect or log it.
[ -f "$KP" ] || { umask 077; solana-keygen new --no-bip39-passphrase --silent -o "$KP" >/dev/null; }
chmod 600 "$KP"
PID=$(solana-keygen pubkey "$KP")
# A missing account is distinct from RPC failure. Existing code requires a separately reviewed old hash.
set +e
python3 "$root/scripts/hook-artifact.py" probe "$PID"
STATUS=$?
set -e
[ "$STATUS" = 0 ] || [ "$STATUS" = 3 ] || exit "$STATUS"
if [ "$STATUS" = 0 ]; then
  [ -n "${QLI_PREVIOUS_FP:-}" ] || { echo "Refusing automatic upgrade: supply reviewed QLI_PREVIOUS_FP explicitly."; exit 1; }
  python3 "$root/scripts/hook-artifact.py" verify "$PID" "$QLI_PREVIOUS_FP" "$ME"
fi
echo "Rent for artifact bytes (ProgramData +45; loader allocation may be larger):"
solana rent "$(($(wc -c < "$SO") + 45))" -u "$URL"
echo "Historical total ~1.4 devnet SOL is an estimate only; CLI deployment reports actual costs."
echo "Deploying as $PID; code fingerprint $FP. This may block token transfers; research, not audited."
read -r -p "Type DEVNET to continue: " ok; [ "$ok" = "DEVNET" ] || exit 1
solana program deploy "$SO" --program-id "$KP" -u "$URL"
bash "$root/scripts/verify-transfer-hook-devnet.sh" "$PID" "$FP" "$ME"
solana program show "$PID" -u "$URL"
echo "Paste verified program $PID and code fingerprint $FP into /hook-devnet step 2. No finalization performed."