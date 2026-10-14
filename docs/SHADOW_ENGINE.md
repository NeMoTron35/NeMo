# QLi Shadow Engine v4

Counterfactual stress grid — not a forecast. Model: constant-product `x·y=k` on **hypothetical** reserves with the input-side fee (0–1000 bps), floor division, BigInt u64-bounded math. When signed in, the quote reserve is anchored to the latest verified observation (slot shown); the base reserve is an operator assumption. Meteora DBC curve math is **not** used (SDK curve state is not verified in this path), so results are labelled `uncalibrated`.

Scenarios: up to 4 trade sizes (bps of quote reserve) + a liquidity-shock scenario. Output: per-scenario output, impact bps, limit violations, min/max, owner-review suggestion. Observed drift compares real consecutive quote-reserve reads only; no trades are inferred. No transactions are built or submitted.

For protocol-accurate quotes on a live pool use Meteora Lifecycle Intelligence (`/meteora-intelligence`), which runs the SDK `swapQuote2` against decoded on-chain state. Shadow remains a hypothetical model and is not used there.
