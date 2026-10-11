# Quantum Identity 2.0 (experimental)

Status: **research only. No on-chain verifier program is built or deployed.** Route: `/identity-v2`.

## What is real
- WOTS (w=16, SHA-256, 67 chains) + height-8 Merkle proofs, verified locally (`src/lib/qli-core/pq.ts`).
- An off-chain model of a multi-transaction staging protocol (`src/lib/qli-core/identity-v2.ts`) with chunk commitment hash, bounded TTL (≤900 s), bounded chunk size, single-use leaf set and action binding (wallet, target, action, genesis, nonce, expiry). Tested in `src/test/qli-v2-updates.test.ts`, including replay, tamper, expiry and message-alteration negatives.

## Feasibility (estimates, not measurements)
- Proof is 2,404 bytes; a Solana transaction is 1,232 bytes, so a proof needs 3 staged chunks.
- Worst case ≈1,015 SHA-256 calls; estimated ≈ 140k CU using published syscall costs, under the 1.4M CU cap. Must be measured in a real SBF program before any claim.

## Not done (NOT COMPLETE)
- Rust/Anchor verifier program, SBF compute measurement, on-chain commitment registry, ML-DSA.
- Never wired to vault withdrawal. A verified proof or commitment is **not** authorization.
- Ed25519 wallet signatures are not post-quantum; Solana funds are not quantum-resistant.