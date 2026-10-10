# Frozen v1 compatibility

Operational code and components use `src/lib/qli-core/` and `src/components/qli-core/`. Public-parity modules remain under `qli`. Content routes and public API paths are unchanged.

`src/lib/qli-core/compatibility.ts` is the sole source of retired-brand protocol literals: four domain strings, the WOTS proof kind, ledger prefix, three signed-message prefixes and the public demonstration derivation input. They are frozen **protocol bytes**, not current branding. Changing them would invalidate existing proofs, change identities or signatures, or lose consumed-leaf lookup history. Existing qtk1 address/checksum encoding and HKDF/hash tags are unchanged too.

`src/test/qli-core-v1-vector.json` contains a public reference proof captured before the rename, with the original root, public seed, address, signature/path, serialized-proof hash, message digest and withdrawal commitment. It contains no private key. Regression tests verify the original proof and reproduce every serialized byte, plus unchanged wallet derivation messages and existing ledger reuse prevention.

## Strict auditing

`scripts/brand-audit.ts` rejects the retired identifier in every source path and every unapproved content line. Exceptions use exact SHA-256 line fingerprints; edits to even an allowed line fail. The allowlist is now restricted to the immutable compatibility module only.

All repository coordinates, CODEOWNERS entries, issue-template links, README content and repository documentation use the current **QuantumQLi/QuantumQLi** identity.

No alias, forwarding module or directory preserves the old internal namespace. Site-builder vendor hygiene remains unconditional with zero exceptions. Auth, wallet review, proof verification and secret handling are not weakened.
