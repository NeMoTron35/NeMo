---
id: post-quantum
title: Post-quantum primitives and WOTS
group: Security and protocol
summary: Separate standard library operations from custom reference identities.
---

# Post-quantum primitives and WOTS

## Standard-library workbench

`@noble/post-quantum` 0.7.1 implements ML-DSA-65 (FIPS 204), SLH-DSA-SHA2-128s (FIPS 205) and ML-KEM-768 (FIPS 203). Browser signing and decapsulation are local operations. Public API operations are verification and encapsulation. Use of standardized primitives does not certify this application or protect normal Solana accounts.

## Custom WOTS reference

The identity implementation uses SHA-256, w=16, 67 chains, 32-byte elements and a Merkle tree of height 8 (256 leaves). A digest has 64 base-16 digits plus three checksum digits. Verification finishes each chain to recover the public leaf and follows eight sibling hashes to the root.

The raw proof payload accounts for 4 bytes of leaf index, 67×32 signature bytes and 8×32 path bytes: **2,404 bytes**. JSON carries additional public fields and encoding overhead; its size is not 2,404 bytes.

## One-time requirement

Reserve a leaf before signing and never reuse it. Local persistence is a guard, not a trusted multi-device ledger. Losing the consumed-index history can permit unsafe reuse. A reference root is not a certified XMSS implementation or third-party protocol-compatible identity.

## Versioned compatibility

User-facing branding is Quantum QLi. Existing `qtk1`, the domains in `src/lib/qli-core/compatibility.ts`, proof kind and memo/ledger encodings remain for compatibility. Display renaming must not change consumed-key identity.

## Future-looking schemes

FN-DSA/Falcon is experimental here; hybrid ed25519+ML-DSA is advanced experimental. Many-time launch certification is not integrated. No on-chain post-quantum custody verifier is deployed.