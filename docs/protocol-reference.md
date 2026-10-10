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

The exact frozen identifiers live in `src/lib/qli-core/compatibility.ts`: `DOMAINS.identity`, `DOMAINS.launch`, `DOMAINS.proof` and `DOMAINS.quantumWallet`. These bytes are protocol identifiers, not current branding; changing them invalidates existing proofs and identities.

## Public proof shape

Proof Inspector accepts supported public reference JSON with `kind` equal to `WOTS_PROOF_KIND`, a supported `domain`, `label`, exact signed `message`, `leaf`, hexadecimal `publicSeed` and `root`, 67 hexadecimal signature elements and eight hexadecimal authentication-path elements. Use its valid/tampered loaders to obtain actual examples; symbolic constant names are not valid wire values.

## Address and memo

A qtk1 reference address derives from the root and public seed with a truncated identity-domain hash, the implementation's 32-symbol alphabet and a six-hex-character checksum. It is not a spendable Solana address.

The SPL Memo payload is `IDENTITY_MEMO_PREFIX + address + ":" + root`, using the frozen compatibility constant. Signing it locally does not publish it.

## Sizes and guardrails

- w=16, n=32 bytes, 67 chains, h=8, 256 leaves.
- Raw signature/path/index accounting: 2,404 bytes; JSON is larger.
- Consumed leaves cannot be reused in the loaded local ledger.
- No global ledger, independent certification or deployed verifier is implied.
