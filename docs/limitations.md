---
id: limitations
title: Known limitations and adapter boundaries
group: Reference
summary: What is demonstrated, read-only, local or genuinely unavailable.
---

# Known limitations and adapter boundaries

## Current capability matrix

| Capability                                         | State                                               |
| -------------------------------------------------- | --------------------------------------------------- |
| Standard PQ signing / decapsulation                | Real browser-local workbench operations             |
| Public verify / encapsulate API                    | Implemented with public material and bounded bodies |
| Wallet connection and readonly reads               | Browser-wallet/RPC dependent                        |
| Reference identity derive/register/prove           | Implemented locally; no global registry             |
| Reference SPL Memo anchor                          | Prepare/simulate/sign only, no submission           |
| WOTS launch seal                                   | Reference proof over a limited canonical field set  |
| Other launch signature certificates                | Not integrated despite selectable schemes           |
| DBC launch UI                                      | Draft/validation/review only, no launch broadcast   |
| Operator modes / liquidity / positions / fees      | Demo/session previews, no unattended execution      |
| Live market provider / swaps                       | Demo adapter; Flywheel buyback swaps own DBC pool   |
| ML-DSA vault key and local withdraw signature      | Implemented locally, no custody                     |
| WOTS vault-chain / staging                         | Reference model, verifier program null              |
| Vault creation / deposit / withdrawal              | Live execution unavailable                          |
| Custodial keys / server sign / decapsulate / usage | 501 unavailable public API operations               |
| Durable settings / strategies / audit              | Not implemented; session state only                 |
| Reference consumed-leaf ledger                     | Browser-local persistence, no synchronized lock     |
| Worker health history                              | Volatile observed checks, not uptime                |

## Interpretation rules

No fake transaction success, guaranteed yield, independent audit, deployed quantum custody or third-party proof compatibility is claimed. A service adapter or SDK method existing in source is not evidence that the UI invokes it live. A valid proof says nothing about the uncommitted economic inputs, actual asset ownership or chain confirmation.

## Production work remains explicit

Live provider integrations, reviewed launch broadcast, multi-device one-time-key enforcement, audited verifier deployment, secure metadata persistence and production operational monitoring require separate implementation and verification. These docs preserve current features without pretending those boundaries are complete.

## Quantum Authorization v1

Application-level authorization only — not on-chain enforced. Other clients and directly signed transactions can bypass this additional gate. There is no deployed verifier program or QLi vault. Replay protection is session nonce tracking plus the browser-local leaf ledger, not durable or global. The policy is stored in browser local storage and is mutable and browser-specific; a corrupted stored policy fails closed. Authorization records live in the tab session only.

## QLi Agent

Session-only observer; pauses when browser closes, when the tab is hidden, or on wallet/network/RPC change or read error. Rules-based analysis only; no AI provider is configured. Proposals never execute; every transaction goes through the Flywheel review and fresh wallet approval. Curve progress shows Unknown when not readable. No background worker or durable persistence.

## QLi Agent v2

Background monitoring depends on the published site serving the worker and on the scheduled job; the page shows Verified only after a recent successful run. Public Solana RPC may refuse or rate-limit server reads; set a server RPC for reliable mainnet monitoring. Confirmed-commitment reads, no intermediate history during outages, in-app notifications only, no AI analysis, no execution.

## Quantum Vault Phase 1

Genuine SBF compilation and compiled-program local Solana bank tests passed, including actual SPL token CPI and negative cases. Standalone validator/public devnet deployment remain unverified; no owner-controlled deployment signer available. Not audited; DEVNET NOT DEPLOYED — writes disabled. Ordinary owner signature, not post-quantum. Immutable policy; fixed (not sliding) 24-hour cap; classic SPL Token only; no rent or signer recovery.

## October 2026 update

Program Verifier and Vault Sentinel are read-only and never enable writes or sign. Identity 2.0 is an off-chain model only; no program verifies post-quantum proofs. See docs/QUANTUM_IDENTITY_V2.md.

## Vault Sentinel persistence and Identity verifier (Oct 2026)

- Vault monitoring tables are backend-only; ownership comes from the wallet-signed session matched to the on-chain owner, never a typed address. Inactive until a verified devnet deployment is configured.
- The Rust identity verifier is a reference library only: not an on-chain program, not deployed, not audited, never vault authorization. Spend cap remains a fixed 24-hour window, not rolling.

## Neural / Proof / Shadow / Threat Graph / Arena

Hugging Face is not configured; no live AI result has been observed. Concurrency limit is per server instance. Shadow does not use DBC curve math and is uncalibrated. Threat Graph covers only registered relationships. The Space export is not published.

Hosted-call budgets are durable and serialized in the database; the 2-call concurrency limit is per server instance. Canonical proof hashing uses the ECMAScript shortest number form for non-integers.

Hosted owner consent defaults off. Neural handoff supports fee-claim review only, never signing or broadcasting. Actual hosted inference needs both HF settings; physical Phantom approval, local-validator execution and owner-controlled deployment need external prerequisites. No inference, Solana deployment, transfer or website publication accompanies this code change.