---
id: protocol-reference
title: Protocol reference and proof encodings
group: Reference
summary: Preserved reference equations, domains and public proof shape.
---

# Protocol reference and proof encodings

## WOTS reference equations

The versioned reference uses a 32-byte message digest, 64 base-16 digits and three checksum digits. The public seed, leaf, chain index and step participate in hashing. This is a custom reference encoding, not a certification or third-party compatibility claim.

```text
digits   = base16(H(domain || 0x00 || message))
checksum = sum(15 - digit) -> 3 base16 digits
sig_i    = F^digit_i(secret_i)
pk_i     = F^(15-digit_i)(sig_i)
F(x)     = SHA-256(proofDomain || publicSeed || leaf || i || j || x)
```

## Derivation implementation

The verified wallet message signature is hashed. If a passphrase is supplied, its NFKC-normalized UTF-8 bytes are used for scrypt before expansion.

```text
ikm = SHA-256(walletSignature)
ikm = scrypt(passphrase, identityDomain || ikm, N=32768, r=8, p=1) [optional]
okm = HKDF-SHA256(ikm, salt=identityDomain, info="qtk-seed", length=64)
skSeed = okm[0:32]
publicSeed = okm[32:64]
```

## Versioned namespaces

```text
identity       quantek.network/identity/v1
launch         quantek.network/launch/v1
proof          quantek.network/proof/v1
quantumWallet  quantek.network/quantum-wallet/v1
```

The product display name is Quantum QLi. Existing technical identifiers are intentionally retained.

## Public proof shape

Proof Inspector accepts supported public reference JSON. The following is a shape illustration, not executable valid proof material. Use its valid/tampered loaders to obtain actual reference examples.

```json
{
  "kind": "quantek-wots16-merkle-v1",
  "domain": "quantek.network/proof/v1",
  "label": "public-demo",
  "message": "the exact signed challenge",
  "leaf": 7,
  "publicSeed": "32 bytes as hexadecimal",
  "root": "32 bytes as hexadecimal",
  "signature": ["67 elements, each 32 bytes as hexadecimal"],
  "authPath": ["8 elements, each 32 bytes as hexadecimal"]
}
```

## Address and memo

A qtk1 reference address derives from the root and public seed with a truncated identity-domain hash, the implementation's 32-symbol alphabet and a six-hex-character checksum. It is not a spendable Solana address.

```text
quantek:v1:identity:<qtk1-address>:<root>
```

This is the SPL Memo payload prepared by the current Anchor path. Signing it locally does not publish it.

## Sizes and guardrails

- w=16, n=32 bytes, 67 chains, h=8, 256 leaves.
- Raw signature/path/index accounting: 2,404 bytes; JSON is larger.
- Consumed leaves cannot be reused in the loaded local ledger.
- No global ledger, independent certification or deployed verifier is implied.
