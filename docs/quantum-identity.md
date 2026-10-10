---
id: quantum-identity
title: Quantum Identity
group: Identity and proofs
summary: Local derivation, registration, anchor preparation and possession proof.
---

# Quantum Identity

## Derive

Connect a supported wallet and review the exact derivation message. Message signing verifies returned bytes and the ed25519 signature before local HKDF-SHA256 key expansion. Optional passphrase hardening uses NFKC normalization and scrypt with N=2^15, r=8, p=1. A supplied passphrase must match its confirmation and contain at least 12 characters. The message includes the wallet address and network: changing those or the signed message changes the derivation input. Deterministic re-derivation additionally depends on identical wallet signature behavior.

The public demo uses a known published secret and is never safe for live attribution. Reference trees and secrets live in the session; no secret backup service exists.

## Register

Create a Local Registration Profile. Leaf zero signs the binding message and is reserved before signing. This is not a server registration or a global identity registry. Registration can fail if leaf zero was already used; register before generating other proofs.

## Anchor

Prepare an unsigned SPL Memo using the connected wallet as fee payer, inspect its accounts/fee, simulate and sign locally. Public-demo anchoring is blocked. The current page stops at **signed, not submitted**; it has no anchor-broadcast/confirmation step. A local signature is not a public timestamp.

## Prove

Generate a random nonce, reserve the next unused leaf and sign a possession challenge binding address, root and leaf. Verify the returned public proof. Proofs consume leaves even if a later operation fails; consumed leaves are never rolled back.

## Leaf ledger

Reference ledgers persist root, consumed indexes and purpose labels under the existing `quantek.ledger.v1:` storage namespace. Public-demo ledgers are session-only. This local guard is not a synchronized cross-device lock: clearing/corrupting storage or using multiple tabs/devices can defeat reuse protection. Never treat it as production key-management enforcement.

Closing an identity drops references to its tree. JavaScript cannot guarantee secure erasure; this identity close path does not explicitly zero every WOTS seed buffer. See [Security](/docs?article=security).