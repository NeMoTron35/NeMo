# Quantum QLi feature matrix

This matrix separates implemented functionality from planning, connected-wallet data and research/reference surfaces.

| Surface | Status | Evidence / boundary |
| --- | --- | --- |
| Local ML-DSA-65 signing / verification | **Implemented** | Runs locally through Noble post-quantum primitives |
| Local SLH-DSA-SHA2-128s signing / verification | **Implemented** | Runs locally through Noble post-quantum primitives |
| Local ML-KEM-768 encapsulation / decapsulation | **Implemented** | Runs locally; private material is not exposed through the public API |
| Proof Inspector | **Implemented** | Parses and verifies supported proof/signature formats |
| Connected-wallet Portfolio | **Wallet-backed** | Reads connected-wallet/RPC state when available |
| Vault cryptography | **Implemented locally** | Local cryptographic workflows; non-custodial |
| Launch Forge | **Planning / validation** | Seven-stage Meteora DBC planning targeting DAMM v2 migration; review is not deployment |
| QLi Operator Observe / Guarded | **Implemented planning** | Deterministic plans and guardrails; signing remains wallet-controlled |
| QLi Operator Autonomous | **Scheduling preview** | No unattended production signer or background trading service |
| Quantum Identity WOTS/Merkle | **Reference implementation** | One-time leaf consumption is tracked locally; no global reuse ledger |
| Identity anchor | **Bounded transaction flow** | Distinguishes signed bytes, submission and confirmation |
| Liquidity Chambers / Inventory / Revenue | **Reference datasets** | Structured research surfaces; not presented as connected-wallet holdings |
| Public crypto API | **Implemented with limits** | Verification/KEM operations only; no custodial private-key API |
| Technical docs / White Paper | **Implemented** | First-party docs under `docs/` plus in-app readers |

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

"Post-quantum" in Quantum QLi refers to the local/application-layer cryptographic primitives and research/reference identity work. It is not a claim that Solana's current network authorization scheme has been replaced or made post-quantum secure.
