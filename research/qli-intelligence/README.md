# Quantum QLi Intelligence reference implementation

**Status: executable offline reference, not a deployed trading agent, hosted model, or mainnet custody system.**

This directory contains testable, dependency-free Node.js components for the next QLi
intelligence release. The production application builder application has its own TS/server
integration; this reference provides independently reproducible checks to compare against
its business logic. Passing these tests **does not prove the live app is connected.**

## Capabilities

| Component | Implemented | Scope |
| --- | --- | --- |
| Neural Engine | `huggingface.mjs` | Auth-bound, opt-in server-only HF chat completion using an allowlisted model and numeric evidence; clearly returns deterministic 'not configured' if `HF_TOKEN` absent |
| Shadow Engine | `core.mjs` | Exact u64-based constant-product counterfactual and five shocks. **Not a Meteora DBC quote** or future prediction |
| Proof Engine | `core.mjs` | Domain-separated SHA-256 canonical offchain evidence receipt, verification and expiry. **Not an on-chain attestation or signature** |
| Threat Graph | `core.mjs` | Chain-verified public edges only, deduplication and informational concentration signals. **Not a finding of malicious intent** |
| Model Arena | `model-arena.mjs` | Deterministic baseline with fixed labeled synthetic cases, evidence-grounding and unsafe-claim checks. **No fake model benchmarks or paid calls** |

## Security boundaries

- No private keys, session tokens, wallet addresses, transaction bytes, deployment, or external API calls in default tests.
- `huggingface.mjs` is **server-only**. In the real application, call it only
  **after** a wallet-signed `requireSession(token)` and a server-side database
  lookup verifying the requesting wallet owns the observed registered pool or vault.
  The `authBound` boolean is an integration guard, **not authentication** by itself.
- Never send raw RPC account structures, pool addresses, vault addresses,
  transaction history, wallet identifiers, user text containing secrets, or private
  keys to an external model. Only send the allowlisted numeric observations.
- Configure `HF_TOKEN` as a **server secret in application builder**. Do not store it in
  GitHub, browser bundles, SQL rows, or public Spaces. Models incur possible cost;
  restrict production calls using per-wallet quotas and abuse controls.
- Hashes prove that *a particular local receipt has not changed since its digest
  was calculated*. They do not establish truthful RPC provenance, actual model
  reasoning, trusted timestamps, account ownership, or legal/security compliance.
- All suggested actions are informational and require independent review.
  Mainnet, even if enabled for read-only observation, is **never** implied to
  allow automated trades or custody.
- Hypothetical constant-product stress testing is not a Meteora DBC model.
  The real DBC SDK and observed curve parameters are required for real DBC analysis.
- Graph relationships are public, known, verified links and are never labels
  accusing wallets of wrongdoing; concentration alone is not evidence of abuse.
- Model Arena data are invented synthetic fixtures and benchmark only the exact
  local rules. They cannot be advertised as real-user or hosted-model scores.

## Run

Requires Node 22+ (no dependency installation):

```bash
node --test research/qli-intelligence/*.test.mjs
```

To connect the optional Hugging Face bridge in **server-side** application code,
follow the official [Inference Providers](https://huggingface.co/docs/inference-providers/tasks/chat-completion)
router contract. Model availability, permissions and costs may change.
The operator must configure a token with the required Inference Providers
permissions. Do not activate inference in a public UI based only on the presence
of frontend settings.

## Release gates

1. Production neural server functions must perform wallet-signature session
   verification, registered-pool ownership checks, network genesis checks,
   bounded rate limits, privacy minimization, consent and model output auditing.
2. Calibrate any pool-specific simulation using actual DBC curve math and
   observed chain state before presenting it as a pool estimate.
3. Verify proof receipt canonical vectors across Node and browser implementations;
   store evidence securely with retention and owner-scoped access.
4. Threat graph edges must be independently observed via validated RPC, with
   slot + source evidence hashes and duplicate/reorg handling.
5. Hosted model evaluation is opt-in, budgeted, and separately tagged
   'measured'; the deterministic baseline is never labeled a hosted model.
6. Complete CI, security review, user testing, and explicit owner approval before
   enabling public production features.

**No network deployment or wallet signature is included in this branch.**

## Publish the synthetic Space (operator-only)

The GitHub workflow [Publish QLi Synthetic Research Space](../../.github/workflows/qli-huggingface-research-space.yml)
is manually triggered from GitHub Actions. It **never** runs on push and does
not access any user's wallet or pool. It publishes only three allowlisted files:
the Space card, UI and synthetic deterministic engine.

To activate it, an authorized operator must:

1. Configure a GitHub Actions `HF_TOKEN` **secret** with permissions to
   write a Space in the intended Hugging Face namespace. Never commit the token.
2. Configure the GitHub Actions `HF_SPACE_ID` **variable** as
   `your-own-huggingface-account/qli-shadow-research` (replace the account
   with the owner's actual namespace). The job uses the `hf-research`
   environment if additional approvals are required.
3. Run **Publish QLi Synthetic Research Space** manually and deliberately
   select `PUBLISH`. The default choice `NO` prevents an accidental release.
4. Open the URL reported by the action and verify the Space has completed its
   Gradio build. This workflow does not guarantee hosting availability or
   bypass the Hugging Face account's hardware / eligibility requirements.

The separate **live QLi Neural Engine** also requires `HF_TOKEN` and
`HF_MODEL_ALLOWLIST` configured as **server-only** secrets on the app's
production hosting environment. Those hosting settings are independent of
the GitHub publication workflow. Publishing this offline Space does not
activate the live model bridge.

No mainnet or devnet Solana program is deployed by this workflow. Even a
successful Space publication cannot grant authority to trade or withdraw.
