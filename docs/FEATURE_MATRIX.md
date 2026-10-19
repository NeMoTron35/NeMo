# NEMOTRON3.5 feature matrix

This page separates implemented functionality from connected-wallet, planning and research/reference surfaces.

## Implemented locally

- **ML-DSA-65 signing and verification** — runs locally through Noble post-quantum primitives.
- **SLH-DSA-SHA2-128s signing and verification** — runs locally through Noble post-quantum primitives.
- **ML-KEM-768 encapsulation and decapsulation** — runs locally; private material is not exposed through the public API.
- **Proof Inspector** — parses and verifies supported proof and signature formats.
- **Vault cryptography** — local cryptographic workflows with a non-custodial boundary.
- **Technical documentation and White Paper** — first-party material under `docs/` plus in-app readers.

## Connected-wallet surfaces

- **Portfolio** — reads connected-wallet and RPC state when available.
- **Wallet transaction review** — wallet authorization remains explicit and client controlled.

## Planning and validation

- **Launch Forge** — seven-stage Meteora DBC planning targeting DAMM v2 migration. Review is not deployment.
- **NEMOTRON3.5 Operator Observe / Guarded** — deterministic plans and guardrails with wallet-controlled signing.
- **Identity anchor** — distinguishes signed bytes, submission and confirmation as separate states.

## Research and reference surfaces

- **Quantum Identity WOTS/Merkle** — reference construction with one-time leaf consumption tracked locally; there is no globally synchronized reuse ledger.
- **NEMOTRON3.5 Operator Autonomous** — scheduling preview only; there is no unattended production signer or background trading service.
- **Liquidity Chambers / Inventory / Revenue** — structured reference datasets, not connected-wallet holdings.
- **Public crypto API** — bounded verification and KEM operations; no custodial private-key API.

## Verification baseline

At the current verified snapshot:

- 59 tests pass.
- ESLint reports 0 errors and 0 warnings.
- Type checking passes.
- Production build passes.
- Repository-hygiene checks pass.
- Dependency audit reports 0 advisories at every severity.
- The tracked-file vendor-name scan reports 0 matches.

## Security interpretation

"Post-quantum" in NEMOTRON3.5 refers to the local and application-layer cryptographic primitives plus research/reference identity work. It is not a claim that Solana's current network authorization scheme has been replaced or made post-quantum secure.
