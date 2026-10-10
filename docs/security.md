---
id: security
title: Security model and trust boundaries
group: Security and protocol
summary: Local secrets, explicit demos and no claim of quantum-safe custody.
---

# Security model and trust boundaries

## Noncustodial by design

Wallet authorization happens in the client. The product does not store private keys, derivation signatures, passphrases or WOTS secrets remotely. Prototype ML-DSA keys live in tab memory. Backup is explicit and offline.

## Not a security certification

Ordinary Solana balances remain ed25519-authorized. Provenance proofs cannot replace account authorization. There is no independently audited, deployed Quantum QLi custody verifier. Browser compromise, malicious extensions and compromised RPC/device environments are not solved by algorithm choice.

## Local state caveats

WOTS reference leaf records persist public roots, used indexes and purpose labels only. They are mutable browser storage, not cross-tab atomic reservations or a synchronized recovery ledger. Public-demo identity secrets are known. Identity close drops references but does not explicitly zero all WOTS buffers; JavaScript cannot promise secure erasure.

## Review and privacy

Signing rejects changed reviewed bytes, wrong genesis/payer and expired blockhash. This is not a guarantee that a reviewed transaction is economically safe. Utility output uses public statuses and plan titles only. Do not enter credential-bearing RPC URLs.

## Public API boundary

Public crypto endpoints accept bounded public material without user authentication; no private-key signing or decapsulation endpoint is active. CORS permits public requests. No project quota or API-key authorization layer is implemented. Rate limiting and durable abuse monitoring are not established by this code.

## Server support

The project has server error handling, server-function CSRF middleware and generated authenticated-service support. Their presence is not a claim that every product page uses account authentication or durable persistence.
