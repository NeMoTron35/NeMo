# Frozen v1 compatibility

Operational code and components use `src/lib/qli-core/` and `src/components/qli-core/`. Public-parity modules remain under `qli`. All content routes and public API paths are unchanged.

`src/lib/qli-core/compatibility.ts` is the sole source of retired-brand protocol literals: four domain strings, the WOTS proof kind, ledger prefix, three signed-message prefixes and the public demonstration derivation input. They are frozen bytes, not current branding. Changing them would invalidate existing proofs, change identities/signatures or lose consumed-leaf lookup history. Existing qtk1 address/checksum encoding and HKDF/hash tags are unchanged too.

`src/test/qli-core-v1-vector.json` contains a public-demo proof captured before renaming, with the original root, public seed, address, signature/path, serialized-proof hash, message digest and withdrawal commitment. It contains no private key. Regression tests verify the original proof and reproduce every serialized byte, plus unchanged wallet derivation messages and existing ledger reuse prevention.

## Strict auditing

`scripts/brand-audit.ts` rejects retired names in all source paths and all unapproved content lines. Exceptions use exact SHA-256 line fingerprints; edits to even an allowed line fail, and tests verify every fingerprint still exists. Protocol exceptions are restricted to the compatibility module.

Six additional lines retain actual external GitHub coordinates: the application repository link, two README workflow badges, the issue-template security link, CODEOWNERS account and repository metadata note. These are not cryptographic constants. They must not be silently renamed: a different repository or account has not been supplied, and inventing one would break navigation, status badges or ownership/security reporting. This is the only exception to protocol-only content neutrality. Maintainers must rename the remote repository/account or supply verified replacement coordinates before these six lines can be removed.

No alias, forwarding module or directory preserves the old internal namespace. Vendor-name hygiene remains unconditional with zero exceptions. Auth, wallet review, proof verification and secret handling are not weakened.
