#!/usr/bin/env bash
# Reproducible per-network SBF build of the Mode B vault (pinned Agave 2.2.20, platform-tools v1.57).
# Writes target/pq-vault-<network>/ with the .so, a .sha256 and a public build manifest.
# Never generates, reads or keeps a program keypair (the throwaway one cargo-build-sbf writes is deleted).
set -euo pipefail
NET="${1:-}"
case "$NET" in
  devnet) FEAT="" ;;
  mainnet-beta) FEAT="--features mainnet" ;;
  *) echo "usage: $0 devnet|mainnet-beta" >&2; exit 2 ;;
esac
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/target/pq-vault-$NET"
cargo-build-sbf --version | grep -q "2.2.20" || { echo "Need cargo-build-sbf 2.2.20" >&2; exit 1; }
mkdir -p "$OUT"
# shellcheck disable=SC2086
cargo-build-sbf --tools-version v1.57 $FEAT \
  --manifest-path "$ROOT/programs/quantum_pq_first_buy_vault/Cargo.toml" --sbf-out-dir "$OUT"
rm -f "$OUT"/*-keypair.json
SO="$OUT/quantum_pq_first_buy_vault.so"
( cd "$OUT" && sha256sum quantum_pq_first_buy_vault.so > quantum_pq_first_buy_vault.so.sha256 )
ID="$(grep -E "qli:program-id:$NET\$" "$ROOT/programs/quantum_pq_first_buy_vault/src/lib.rs" | sed -E 's/.*"([^"]+)".*/\1/')"
cat > "$OUT/build-manifest.json" <<JSON
{"network":"$NET","programId":"$ID","features":"${FEAT:-none}","toolsVersion":"v1.57","cargoBuildSbf":"2.2.20","sha256":"$(cut -d' ' -f1 "$OUT/quantum_pq_first_buy_vault.so.sha256")","length":$(stat -c%s "$SO"),"provisional":$([[ "$ID" == *UNSET* || "$ID" == 9EqcFT8B* ]] && echo true || echo false)}
JSON
cat "$OUT/build-manifest.json"