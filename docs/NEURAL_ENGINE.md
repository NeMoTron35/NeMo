# QLi Neural Engine v3

Read-only question answering over one creator-verified, registered Meteora DBC pool (mainnet-beta or devnet, matched by genesis at registration).

- Evidence: the latest worker observation is sanitized into numeric-only evidence `E1…E7` (SOL amounts, progress %, migrated flag, age). Pool addresses become aliases (`P1`); no wallet, pool, session, email or IP data leaves the server.
- Deterministic engine (always on, non-AI): topic classifier + grounded answers with citations; signing/sending/key requests are refused.
- Privacy: the raw question is classified **locally** into a fixed task enum (`fees`, `migration`, `reserve`, `freshness`). Unsupported, signing/transfer, secret-like (base58 32+ chars, seed/mnemonic, password, API key, bearer/cookie/session, long word lists) or injection text maps to no task: it is refused locally and **no hosted request is made**. Outbound bodies contain only the fixed system prompt, the enum task with fixed text, schema-rebuilt numeric evidence with hardcoded labels and the slot; a final guard fails closed on any address- or secret-like content. The question is never logged, stored or sent.
- Hosted model (optional, disabled by default): `https://router.huggingface.co/v1/chat/completions` with `Authorization: Bearer HF_TOKEN`, read only on the server. There is **no default model**: the operator sets `HF_MODEL_ALLOWLIST` (comma-separated, max 2). Before use, the server intersects it with the router's `/v1/models` list (free, cached 10 min); models not listed are unusable (fail closed). `HF_TIMEOUT_MS` 2–20 s, 300 max tokens, temperature 0, 2 concurrent calls per server instance.
- Budget: every hosted request is reserved before it is sent by the SQL function `qli_reserve_model_calls` (transaction advisory lock, all-or-nothing). Caps: `HF_HOURLY_CAP` (default 10/wallet profile), `HF_DAILY_CAP` (30), `HF_GLOBAL_DAILY_CAP` (200 across all users). Reserved calls count even when they fail or time out. Analyze = 1 request on explicit opt-in. Arena = models × 6 safe fixtures (max 12), reserved together, only after a "charges may apply" confirmation.
- Output validation: strict JSON schema; rejects unknown citations, uncited answers, address-like strings, claims of having sent/signed, and numbers not present in evidence. Rejected output is discarded; the deterministic answer stands.
- Status: `HF_TOKEN` is **not configured** in this project. The UI shows "not configured", "configured but no allowlisted model is routable", or "routable — no validated answer observed yet".

Setup: add `HF_TOKEN` and `HF_MODEL_ALLOWLIST` (and optionally the cap variables) in Project Settings → Secrets. No package install required.

## Integrated operator release

Enable **Hosted inference consent** after wallet sign-in and profile creation. It defaults off, is wallet/network-scoped and checked atomically with reservations. Each Analyze/Arena request still needs explicit opt-in. Disabling prevents new reservations, not previously reserved requests.

Discovery must list the exact configured model ID, including any provider suffix. Fixed evidence labels/units reject injected metadata. Logs contain categories only. Request caps and output limits are **not monetary spending caps**; set the provider account spending limit for a currency ceiling. Concurrency is per server instance.

Analysis opens a populated Proof record, relationship context and hypothetical Shadow. Fee-claim review verifies hashes, age and network, checks RPC genesis and independently re-reads creator-owned fees. Only a deterministic review-only proposal reaches Flywheel, which rebuilds, simulates and requires separate wallet approval. Model text never supplies amounts, recipients or instructions.

HF_TOKEN and HF_MODEL_ALLOWLIST remain absent in current secret metadata. No live inference was performed. No wallet signing or deployment occurred.