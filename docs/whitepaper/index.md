# NEMOTRON3.5 — Technical White Paper

Quantum liquidity, under control.

> **Current edition (v0.2, 11 October 2026):** [Read the updated Technical White Paper PDF](../Quantum_QLi_Technical_White_Paper_v0.2_Oct_2026.pdf) covering Flywheel Live, Quantum Authorization and launch execution. The remainder of this Markdown document is the historical v0.1 text.

Version 0.1 — October 2026

## Executive Summary

NEMOTRON3.5 is a non-custodial Solana liquidity workspace, launch planner and cryptography workbench. Its classic desktop interface unifies operation previews, local identity proofs, public cryptographic tools and read-only wallet information. This paper describes the current implementation, not a completed production trading or custody system.

The workbench performs real local ML-DSA-65 and SLH-DSA-SHA2-128s signature operations and ML-KEM-768 encapsulation/decapsulation roundtrips. Quantum Identity is a separate reference WOTS/Merkle construction. These capabilities do not make Solana itself post-quantum secure.

> **Authorization boundary:** Current Solana account and transaction authorization remains based on the network's existing signature model, including ed25519. Wallet approval remains explicit. A local proof, successful simulation or launch seal is not deployment, settlement or quantum-safe custody.

This paper accompanies the [27 technical documentation articles](/docs), which describe individual workflows, configuration and contributor details.

## 1. Problem Statement

Liquidity operations combine asset metadata, curve design, fees, migration policy, transaction construction and wallet authorization. Mixing these concerns can obscure which inputs were reviewed, which data is illustrative, and which actions actually reached the network.

Post-quantum demonstrations create a second ambiguity: a standard cryptographic primitive can operate correctly while the surrounding identity coordination, custody verifier and account authorization remain incomplete. NEMOTRON3.5 separates these layers visibly and technically. Its present scope is an inspectable planning and reference-proof environment, with narrower live read and signing adapters.

## 2. Design Principles

- **Explicit authorization:** Connection is not approval. Transaction review, simulation and wallet signing are distinct steps; submission is separate.
- **Non-custodial operation:** No product service stores wallet private keys, derivation signatures, passphrases or WOTS secrets remotely.
- **Honest state:** Demo records, scheduling previews, reference proofs and unavailable adapters are labelled rather than represented as live execution.
- **Public verification:** Proof inspection and bounded public cryptographic operations accept public material without a custodial signer.
- **Compatibility:** Existing `qtk1` encodings and versioned protocol namespaces remain stable across display renames.
- **Accessible desktop semantics:** Keyboard movement, focus, menus and stacked mobile windows preserve access to retained capabilities.

These are design constraints, not independent audit findings or guarantees against device compromise.

## 3. System Overview

The application uses TypeScript, React and file-based TanStack Start routes. A shared desktop shell and session providers preserve previews during navigation. Typed demo repositories remain distinct from transaction adapters. Cryptography is invoked locally or through bounded public API handlers; wallet-standard access occurs after hydration.

The main layers are presentation, session state, domain services, and external boundaries. Presentation does not confer signing authority. Domain services include Meteora DBC preparation, reference proof verification and library-backed post-quantum operations. External boundaries include the connected wallet, selected Solana RPC and deliberately unavailable production integrations.

Session strategies and plans are not durable production records. A refresh clears session-only operation state and in-memory keys. Reference consumed-leaf records persist separately in browser storage.

## 4. Desktop Interaction Model

NEMOTRON3.5 presents tools as applications within a classic desktop. Global menus, grouped source lists and the module Dock provide overlapping navigation paths. The main application window and NEMOTRON3.5 Console utility window support focus ordering and bounded movement. Keyboard alternatives and reset controls avoid dependence on dragging.

On smaller screens, utility windows join document flow and navigation remains available through compact controls. The console exposes public session status and reviewed-plan titles, not secrets or raw RPC locations. The White Paper reader adds a section source list, stable section links, sequential navigation and a full-document print view without changing wallet or proof state.

## 5. Product Modules

| Module               | Current responsibility                                                  |
| -------------------- | ----------------------------------------------------------------------- |
| NEMOTRON3.5 Desk     | Public cryptography workbench and retained operational overview         |
| NEMOTRON3.5 Operator | Session strategies, guardrails and operation-plan previews              |
| Launch Forge         | Seven-stage DBC drafting and review                                     |
| Liquidity Chambers   | Demonstration pools, filters and pool inspection                        |
| Inventory            | Demonstration positions and operation previews                          |
| Revenue              | Demonstration fee rows and fee-claim plans                              |
| Quantum Identity     | Local reference derivation, registration, anchor preparation and proofs |
| Proof Inspector      | Launch, identity and wallet-spend reference proof inspection            |
| Event Log            | Session/demo events, filtering and export                               |
| System               | Session network, RPC and operating preferences                          |

Public surfaces also include Algorithm Atlas, Market Explorer, Market Pulse, Trade Console, Forge Ledger, Wallet Inventory, Vault Desk, backup and deposit/withdraw prototypes, API Reference and security views.

> **Data boundary:** Demo pool, position and fee rows are not live wallet holdings. The connected-wallet Portfolio/RPC surface can read wallet balances and transactions where RPC access succeeds; it must not be confused with illustrative operational rows. Live market/trading providers and deployed vault authorization remain unavailable.

## 6. Launch Planning and Meteora DBC

Launch Forge uses seven stages: **Asset, Curve, Fees, Migration, Quote Market, First Buy, Review**. The workflow targets Meteora Dynamic Bonding Curve (DBC) and **DAMM v2 only** for migration. The typed adapter uses `@meteora-ag/dynamic-bonding-curve-sdk` and the configured DBC program; a draft is not a deployed pool.

Standard mode produces a plan without a reference seal. Quantum mode requires an open identity and exposes scheme choices; current launch sealing is integrated only for reference WOTS. Many-time ML-DSA or SLH-DSA launch certification is not established by selector availability. FN-DSA/Falcon and hybrid ed25519 plus ML-DSA remain experimental labels.

Quote selection supports crypto, custom mint entry and 61 xStocks presets labelled snapshot — verify live on-chain. RPC mint validation and issuer/jurisdiction warnings do not validate an investment's legal status, underlying asset backing or issuer risk.

> **Seal scope:** The current launch digest binds version, mode, asset name/symbol, metadata URI, decimals, supply, quote mint, DBC program and DAMM v2 target. It does **not** commit to every economic input: curve, fee, social-link and first-buy settings are not all bound. A valid seal must not be interpreted as approval of those settings.

Launch review is **not token deployment**. General review handles demo/simulation plans and does not broadcast a token launch, migration or fee claim. See [Launch Forge documentation](/docs?article=launch-forge).

## 7. Wallet and Transaction Model

The app detects compatible Solana Wallet Standard wallets and requires deliberate connection. Features depend on the wallet's supported message and transaction signing interfaces. Wallet approval remains explicit; the application has no unattended production signer.

The reviewed-transaction adapter freezes reviewed message bytes, verifies account and fee payer, checks RPC genesis against the selected network, validates blockhash lifetime, and simulates without replacing the blockhash. It then rechecks account, expiry and message integrity before asking the wallet to sign. Returned bytes must preserve the reviewed message and a valid payer signature. The adapter returns signed bytes; it does not submit them.

> **Current UI boundary:** The Identity anchor flow can reach **signed, not submitted**. It has no broadcast/confirmation step. This is not a public timestamp or network confirmation. The general Review dialog is not a live deployment interface.

NEMOTRON3.5 Operator's **Autonomous** setting is a scheduling preview, not a background trading service. Guarded operation expresses explicit approval; mode selection does not grant custody. A successful simulation is neither economic advice nor a guarantee that chain state will remain unchanged.

## 8. Post-Quantum Cryptography Model

The current `@noble/post-quantum` workbench exposes **ML-DSA-65** (FIPS 204), **SLH-DSA-SHA2-128s** (FIPS 205), and **ML-KEM-768** (FIPS 203) as real local cryptographic operations. Signature tests include verification and message-tampering checks. ML-KEM demonstrations compare an encapsulated and decapsulated shared secret locally.

ML-KEM is a key-encapsulation mechanism, not a signature scheme or storage product. Standardized primitives do not certify application integration, browser entropy, key lifecycle or custody security. Public API encapsulation returns a ciphertext and shared-secret fingerprint rather than the shared secret.

The identity construction is separate: SHA-256 WOTS with `w=16`, 67 chains of 32-byte elements, and a height-8 Merkle tree with 256 leaves. Verification recovers the public leaf from the signature and follows eight sibling hashes to the root. The 2,404-byte raw signature/path/index accounting excludes JSON and other public fields.

This is a custom reference construction, not a claim of certified XMSS compliance. FN-DSA/Falcon and hybrid schemes are future-looking experimental choices, not evidence of integrated production authorization.

## 9. Quantum Identity and Proofs

The four stages are **Derive, Register, Anchor, Prove**. Wallet-derived reference material uses verified message signatures and local HKDF-SHA256 expansion; optional passphrase hardening uses normalized input and scrypt. Re-derivation depends on identical input and wallet signature behavior. The public demo secret is published and must never be used for live attribution.

Identity is represented by root and public seed with the existing `qtk1` encoding. Local registration consumes leaf #0 for a binding proof. Possession proofs reserve another leaf and bind a challenge to identity context. Domain separation distinguishes proof purposes. Reservations happen before signing and are not rolled back after failures.

> **One-time leaf invariant:** Each WOTS leaf may be consumed once. The reuse ledger is local/browser-based, not globally synchronized across devices or tabs, and not a cross-tab atomic lock. Clearing, corrupting or losing storage, or concurrently signing elsewhere, can defeat reuse protection. Exhaustion requires a fresh identity, not leaf reuse.

Reference ledgers store public root, consumed indexes and purpose labels, not secret derivation material. Demo ledgers are session-only. SPL Memo anchoring is a prepared and locally signed transaction path; a signed memo alone supplies no public timestamp. See [Quantum Identity documentation](/docs?article=quantum-identity).

## 10. Security and Trust Boundaries

Trust is placed in the user's device, browser, wallet, dependency supply chain and selected RPC. Review checks constrain message substitution and network/payer errors; they do not prove economic safety or eliminate malicious extensions, compromised devices or RPC failures.

Prototype ML-DSA vault keys live in tab memory; explicit backup is offline. Clear/unmount paths attempt buffer wiping for these keys. Reference WOTS close drops tree references without explicitly zeroing every seed buffer.

> **Erasure limit:** JavaScript cannot guarantee secure erasure of all secret buffers. Garbage collection, copies, runtime behavior and browser compromise remain outside a reliable wipe guarantee.

No independently audited deployed quantum vault verifier is present. The Quantum Wallet program id is intentionally null and the live adapter refuses construction. Ordinary Solana funds are not post-quantum protected by an identity badge. No private-key service, unattended signing service or custodial API operation is enabled.

## 11. API and Architecture

Public handlers are exposed under `/api/public/v1/`. Available operations include algorithm discovery, real health self-tests, health history, public signature verification and ML-KEM encapsulation. Key creation, server signing, decapsulation and project usage endpoints return unavailable responses rather than simulated custody results.

JSON request bodies are limited to 65,536 bytes. Binary fields are validated for encoding and algorithm-specific dimensions. Responses disable caching, expose public CORS and include request identifiers and timings where applicable. These controls do not establish durable rate limiting, authenticated project quotas or abuse monitoring.

Health history is capped and held in volatile worker memory; public crypto/service history can disappear on restart or differ across instances. It is not uptime evidence. External persistence would need explicit integration and security review; none is established by the current history store.

Routes live in `src/routes/`; desktop presentation in `src/components/`; reference identity, DBC and wallet boundaries in `src/lib/qli-core/`; crypto/API/market/vault modules in `src/lib/qli/`. Technical help bundles Markdown sources from `docs/`. The generated route tree is not manually authored.

Configuration documentation lists environment **names only**, never credentials. Product network, commitment, priority fee, slippage and public RPC choices are session preferences. Managed integration helpers do not imply a secured production metadata repository. See [API documentation](/docs?article=public-api) and [Architecture](/docs?article=architecture).

## 12. Data Classification

| Class                                | Examples                                                                    | Current handling                                                           |
| ------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Public protocol material             | Roots, public seeds, signatures, authentication paths, mints                | Inspectable proof/transaction context; publication requires user judgement |
| Session/demo metadata                | Strategies, plans, illustrative pools/fees, events                          | Session repositories or explicitly labelled fixtures; not chain truth      |
| Browser reuse state                  | Root, consumed indexes, purpose labels                                      | Local reference ledger; not trusted synchronization                        |
| Sensitive local material             | Wallet derivation signatures, passphrases, WOTS seeds, prototype vault keys | Local memory; no product remote secret storage                             |
| User-selected public connection data | Network and public RPC endpoint                                             | Session configuration; credential-bearing URLs must not be entered         |

Public information can still reveal wallet relationships or activity. Non-custodial does not mean anonymous. Exports and offline backups are user-controlled disclosure surfaces; do not include secret material in support requests.

## 13. Testing and Verification

The existing regression suite covers route matching, proof dimensions and tampering, real post-quantum roundtrips, DBC/review boundaries, one-time reference behavior, expansion features and documentation invariants. White-paper tests extend coverage to section identity, source content, routing, navigation, mobile selection, invalid-section fallback and print invocation.

The verification process includes running the full test suite and checking desktop 1280px and mobile 390px views for overflow and working controls. Tests describe observed implementation behavior, not an external security audit, formal proof or mainnet deployment validation. Test counts and run evidence belong to release verification rather than timeless security claims.

Contributors can consult [Local development](/docs?article=local-development), [Deployment notes](/docs?article=deployment) and [Troubleshooting](/docs?article=troubleshooting) for commands matching current scripts and configuration.

## 14. Current Limitations

- No current launch deployment, automatic migration, live fee-claim broadcast or general transaction submission UI.
- No deployed Quantum Wallet verifier or claim of post-quantum Solana account authorization.
- No production globally coordinated WOTS ledger or guaranteed JavaScript secret erasure.
- Launch digest coverage is incomplete for curve, fee, social-link and first-buy inputs.
- Many-time launch certification is not integrated; experimental selectors are not implemented certificates.
- Operator Autonomous is scheduling preview only; no background trading service or unattended signer.
- Operational records and market adapters include explicit demo/fallback behavior; read-only Portfolio RPC information is a separate source.
- Public health history is volatile; project quotas, durable abuse controls and production metadata persistence are not established.
- Identity anchor signing stops before submission and confirmation.

These boundaries are intentional disclosures, not hidden delivery guarantees. See [Known limitations and adapters](/docs?article=limitations).

## 15. Development Roadmap

The following phases are directional research and engineering priorities, not delivery promises, dates or funded commitments.

1. **Phase 1 — Verification hardening:** Expand adversarial tests, review dependency and encoding boundaries, and seek independent assessment.
2. **Phase 2 — Transaction completeness:** Investigate complete economic commitments, reviewed construction, explicit submission and confirmation handling.
3. **Phase 3 — Identity coordination:** Explore atomic leaf reservation, cross-device recovery and defensible key lifecycle without remote secret custody.
4. **Phase 4 — Production data adapters:** Evaluate trustworthy live data, provenance, bounded operational persistence and service abuse controls.
5. **Phase 5 — Post-quantum authorization research:** Study verifier feasibility, transaction cost, authorization semantics and ecosystem constraints before any custody claim.

Progress would require design review and evidence at each boundary. A roadmap item is not an available feature or assurance of security.

## 16. Governance, Tokenomics, and Scope

This white paper defines **no governance token, token sale, revenue-sharing instrument, investment product or guaranteed return**. Launch-planning features do not constitute an offering by NEMOTRON3.5. Revenue labels describe fee-operation interfaces, not entitlements or distributions to readers.

No protocol governance rights, allocation schedule, valuation model or investment solicitation is specified. Tokenized quote presets are informational snapshots with issuer and jurisdiction risks, not endorsements. Future product work would not automatically change this paper's scope or create financial rights.

## 17. Conclusion

NEMOTRON3.5 provides a coherent desktop workspace for inspectable liquidity planning, local cryptographic operations and reference identity verification. Its strongest current distinction is separation of planning, proof generation, wallet authorization and network execution—not an assertion that all production boundaries are complete.

Readers should evaluate real primitives alongside integration limitations: one-time identities need coordination, reviewed transactions still require explicit approval, and post-quantum provenance does not replace Solana authorization. The [technical docs](/docs) provide the implementation-level companion to this versioned paper.

## Appendix A — NEMOTRON3.5 Terminology

| Term                 | Meaning                                                          |
| -------------------- | ---------------------------------------------------------------- |
| NEMOTRON3.5 Desk     | Workbench and operational overview                               |
| NEMOTRON3.5 Operator | Strategy and operation-planning interface                        |
| Launch Forge         | DBC launch-planning wizard                                       |
| Liquidity Chambers   | Pool inspection interface                                        |
| Inventory / Revenue  | Position / fee-operation interfaces                              |
| Quantum Identity     | Reference WOTS/Merkle identity                                   |
| Proof Inspector      | Public proof-verification interface                              |
| Event Log / System   | Session events / configuration                                   |
| Attestation Seal     | Reference signature over the current limited launch digest       |
| Leaf Budget          | Remaining one-time WOTS signing leaves                           |
| Proof Trace          | Verification steps and public proof context                      |
| Anchor               | SPL Memo preparation/signing; not confirmation in the current UI |
| DBC / DAMM v2        | Meteora Dynamic Bonding Curve / migration destination            |
| RPC                  | Remote procedure call service for network queries and simulation |

See the [expanded glossary](/docs?article=glossary) for protocol context.

## Appendix B — Disclaimer

This is an implementation description for version 0.1, not investment, legal or security advice. It is not a certification, independent audit, guarantee of return, token offering or promise of future delivery. Software behavior, dependencies and external services may change.

Cryptographic demonstrations and reference proofs must not be used to infer deployed quantum-safe custody. Solana remains subject to its current account/transaction authorization model. Wallet decisions remain the user's responsibility. Public-demo secrets are known, simulations are not settlement, and signed-but-unsubmitted material is not chain confirmation.

Verify current source, documentation, network and adapter availability before relying on any workflow. Never disclose private keys, passphrases, derivation signatures or backup secrets.
