#!/usr/bin/env bash
# Deterministic SBF build of the research hook (v2.2, adds qlihk:db). No keys, no network writes.
# Tested: Agave 2.2.20 (cargo-build-sbf 2.2.20, platform-tools v1.48, rustc 1.84.1) and
# Agave 4.x. Cargo.lock pins blake3 1.8.2, zeroize 1.8.2, zeroize_derive 1.4.3,
# proc-macro-crate 3.2.0 and indexmap 2.11.4 so older platform-tools cargo (no edition2024) resolves.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$root/programs/quantum_transfer_hook"
cargo build-sbf --version
# --locked: never silently re-resolve pinned dependencies.
# --arch v0: the SBPF version accepted by solana-program-test 2.2 and current devnet loaders.
cargo build-sbf --arch v0 -- --locked
# cargo-build-sbf writes a throwaway program keypair next to the .so; never use or commit it.
rm -f target/deploy/quantum_transfer_hook-keypair.json
SO=target/deploy/quantum_transfer_hook.so
echo "file sha256:      $(sha256sum "$SO" | cut -d' ' -f1)"
# Code fingerprint = sha256 of the bytes with trailing zero padding removed. It equals the
# fingerprint /hook-devnet computes from the deployed ProgramData, so you can prove which build
# is on-chain. Paste it into step 2 as "Your reviewed build fingerprint".
FP=$(python3 -c "import hashlib,sys;d=open(sys.argv[1],'rb').read().rstrip(b'\0');print(hashlib.sha256(d).hexdigest())" "$SO")
echo "code fingerprint: $FP"
if [ "${QLI_HOOK_SBF_TEST:-1}" = "1" ]; then
  (cd ../quantum_transfer_hook_cpi_test && QLI_HOOK_SBF=1 SBF_OUT_DIR="$PWD/../quantum_transfer_hook/target/deploy" cargo test)
fi