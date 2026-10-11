#!/usr/bin/env bash
# OWNER-ONLY. Run on your own computer. Deploys the research hook to Solana DEVNET.
# Creates the program keypair locally (never in the repository), refuses mainnet and refuses to
# upgrade a program whose upgrade authority is not your CLI wallet.
#   bash scripts/deploy-transfer-hook-devnet.sh [~/qli-hook-program.json]
set -euo pipefail
URL=https://api.devnet.solana.com
DEVNET=EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG
root="$(cd "$(dirname "$0")/.." && pwd -P)"
SO="$root/programs/quantum_transfer_hook/target/deploy/quantum_transfer_hook.so"
KP_IN="${1:-$HOME/qli-hook-program.json}"
# Resolve relative paths and symlinks before the in-repository check.
KP_DIR="$(cd "$(dirname "$KP_IN")" 2>/dev/null && pwd -P)" || { echo "Refusing: keypair directory does not exist."; exit 1; }
KP="$KP_DIR/$(basename "$KP_IN")"
[ -L "$KP_IN" ] && KP="$(readlink -f "$KP_IN")"
case "$KP" in "$root"|"$root"/*) echo "Refusing: keep the program keypair outside the repository."; exit 1;; esac
# Optional: EXPECTED_FP=<code fingerprint from your own build or a reviewed CI artifact>.
FP=$(python3 -c "import hashlib,sys;d=open(sys.argv[1],'rb').read().rstrip(b'\0');print(hashlib.sha256(d).hexdigest())" "$root/programs/quantum_transfer_hook/target/deploy/quantum_transfer_hook.so" 2>/dev/null || true)
if [ -n "${EXPECTED_FP:-}" ] && [ "$FP" != "$EXPECTED_FP" ]; then echo "Refusing: artifact fingerprint $FP != EXPECTED_FP."; exit 1; fi
G=$(curl -s $URL -XPOST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getGenesisHash"}' | sed -E 's/.*"result":"([^"]+)".*/\1/')
[ "$G" = "$DEVNET" ] || { echo "Refusing: RPC is not devnet ($G)."; exit 1; }
[ -f "$SO" ] || { echo "Build first: bash scripts/build-transfer-hook-sbf.sh"; exit 1; }
ME=$(solana address)
echo "Payer / upgrade authority: $ME   balance: $(solana balance -u $URL)"
[ -f "$KP" ] || solana-keygen new --no-bip39-passphrase -o "$KP"
chmod 600 "$KP"
PID=$(solana-keygen pubkey "$KP")
if solana program show "$PID" -u $URL >/dev/null 2>&1; then
  AUTH=$(solana program show "$PID" -u $URL | awk '/Authority/ {print $2}')
  [ "$AUTH" = "$ME" ] || { echo "Refusing: $PID upgrade authority is $AUTH, not $ME."; exit 1; }
fi
echo "Code fingerprint: $FP (must match what /hook-devnet shows after deploy)."
echo "Deploying $SO ($(sha256sum "$SO" | cut -c1-16)…) as $PID to devnet. Roughly 1.4 devnet SOL (program + ProgramData rent, estimate)."
read -r -p "Type DEVNET to continue: " ok; [ "$ok" = "DEVNET" ] || exit 1
solana program deploy "$SO" --program-id "$KP" -u $URL
solana program show "$PID" -u $URL
echo "Paste $PID and fingerprint $FP into /hook-devnet step 2. Consider 'solana program set-upgrade-authority $PID --final' only after review."