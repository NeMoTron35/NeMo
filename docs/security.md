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

## Quantum Authorization boundary

The opt-in authorization gate is a usability policy inside QLi, not asset protection or quantum-safe custody. It never signs or sends Solana transactions, stores no secrets, and fails closed when enabled. It is not on-chain enforced: other clients and directly signed transactions bypass it.

## QLi Agent boundary

QLi Agent is read-only. It holds no keys, never builds, signs or sends transactions, and its proposals carry no authority: the Flywheel re-validates, re-reads and rebuilds before any wallet prompt. Handoff uses in-memory state, not URL parameters. Untrusted model output, if ever added, is display-only.

## QLi Agent v2 backend

Wallet-signed, single-use, expiring, rate-limited sign-in verified server-side. Agent tables deny all browser roles; only server code with a verified session (scoped by wallet + network) or the worker can access them. The worker token lives only in the backend database and is compared by hash. The worker has no wallet key and never builds, signs or sends a transaction. Server RPC is allowlisted (no SSRF). No Quantum Identity secrets are sent; only an optional public root.

## Quantum Vault boundary

The Phase 1 program enforces limits on-chain only once deployed; nothing is deployed. It has no admin or rescue path and no server signing. Upgrade authority must be owner-controlled and disclosed at deployment; retained upgrade authority can replace code. Canonical destination authority is immutable. Clients attest devnet genesis, executable program/ProgramData ownership, payload and IDL hashes, then validate account ownership/layout/canonical ATAs. An attestation is bound to unchanged configuration and RPC and expires after 30 seconds; a future signing workflow must repeat it before approval and broadcast. Writes remain disabled. It does not verify WOTS or ML-DSA proofs.

## October 2026 update

Program Verifier and Vault Sentinel are read-only and never enable writes or sign. Identity 2.0 is an off-chain model only; no program verifies post-quantum proofs. See docs/QUANTUM_IDENTITY_V2.md.

## Vault Sentinel persistence and Identity verifier (Oct 2026)

- Vault monitoring tables are backend-only; ownership comes from the wallet-signed session matched to the on-chain owner, never a typed address. Inactive until a verified devnet deployment is configured.
- The Rust identity verifier is a reference library only: not an on-chain program, not deployed, not audited, never vault authorization. Spend cap remains a fixed 24-hour window, not rolling.

## Neural Engine v3 – Model Arena v4.5 (Oct 2026)

Read-only. HF_TOKEN is server-only; only numeric, address-free evidence is sent; allowlisted models, timeouts, quotas; model output is validated and never executable. Proof records are tamper-evident hashes, not signatures or on-chain proofs. Shadow is counterfactual. Threat Graph signals are patterns, never accusations or blocks.

Default-off wallet-session consent is checked atomically with reservations. Fixed metadata and exact discovered model IDs fail closed. Evidence review rechecks hashes/network/freshness and on-chain creator/fees; provenance never authorizes funds. Request caps are not currency guarantees; concurrency is per instance. These checks are not an independent audit.
