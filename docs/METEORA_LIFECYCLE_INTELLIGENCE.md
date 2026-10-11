# Meteora Lifecycle Intelligence v2

Public, read-only intelligence for any Meteora DBC pool (`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`) on Solana mainnet-beta or devnet. Route: `/meteora-intelligence?network=devnet&pool=<address>`. It never builds, signs or sends a transaction, and never claims or withdraws fees.

## Feature status

| Feature                                                       | Status                           | Evidence class            |
| ------------------------------------------------------------- | -------------------------------- | ------------------------- |
| Graduation Sentinel (snapshot, progress, conditions)          | Shipped                          | on-chain + derived        |
| Curve quote simulator (SDK `swapQuote2`, ExactIn)             | Shipped                          | estimate                  |
| Fee intelligence (unclaimed, lifetime, creator/partner split) | Shipped                          | on-chain + derived        |
| Lifecycle timeline (event CPI decode)                         | Shipped, bounded window          | on-chain                  |
| Open Proof API `/api/public/meteora/v1/pools/$network/$pool`  | Shipped                          | mixed, labelled per field |
| Hosted model analysis on this page                            | Not enabled (deterministic only) | n/a                       |

## Trust gates

1. Network is an immutable enum (`mainnet-beta`, `devnet`). RPC URLs are server-owned (`resolveServerRpc`, optional `QLI_AGENT_RPC_*` allowlisted hosts); callers cannot supply an RPC.
2. RPC genesis hash must equal the selected network's genesis, otherwise the lookup is refused.
3. The pool account must be owned by the DBC program and decode as `virtualPool` with the pinned SDK 1.5.13 coder; its `config` must be DBC-owned and decode as `poolConfig`.
4. Every RPC call has a 10 s timeout. 403/429 is reported as `rate-limited`; nothing is inferred.

## Graduation Sentinel

Stage is derived only from on-chain fields: `is_migrated`, `migration_progress`, `quote_reserve` against `migration_quote_threshold`, and `activation_point` against the current slot or block time (per `activation_type`). "Curve complete — awaiting migration instruction" is shown only when the threshold is reached **and** the program marks the curve complete; the page never says a pool will graduate. If the clock cannot be read the stage is `unknown`.

Progress uses the same clamp as `getPoolQuoteTokenCurveProgress`. Fee values use the same arithmetic as `getPoolFeeBreakdown`. Both are computed from one snapshot instead of calling the SDK helpers, because each helper re-fetches the account at a possibly different slot. Oracle-parity tests assert equality with the SDK helpers on a captured fixture.

## Quote simulator

Calls the SDK's `client.pool.swapQuote2` with `SwapMode.ExactIn` on decoded live pool and config state, `hasReferral: false`, `eligibleForFirstSwapWithMinFee: false`. Bounds: amount 1..u64 max atomic units, slippage 0..5000 bps. Refused with an explicit code when migrated, curve complete, not activated, clock unknown (`stale`), partially fillable, or the SDK throws (`unsupported`). "Pool price movement" is `nextSqrtPrice² / sqrtPrice² − 1`, derived. Quotes are estimates at the observed slot, not guaranteed outcomes. The Shadow Engine's hypothetical constant-product model is not used here.

## Fees

Unclaimed creator/partner/protocol fees and lifetime trading fees are read from the pool account. Creator/partner totals and claimed amounts are derived (total minus unclaimed); a negative result is reported as `null`. Claim events in the timeline are separate on-chain evidence.

## Timeline

Reads at most 25 signatures for the pool (default 20) with `before` pagination, fetches each transaction individually (results are bound to their own signature; batched responses are not trusted for ordering), and decodes DBC event-CPI inner instructions only when the program is DBC, the first account is the DBC event authority and the event's `pool` equals the looked-up pool. Tracked IDL events (1.5.13): `EvtInitializePool`, `EvtSwap`, `EvtSwap2`, `EvtCurveComplete`, `EvtClaimCreatorTradingFee`, `EvtClaimTradingFee` (partner), `EvtWithdrawMigrationFee`, `EvtCreateMeteoraMigrationMetadata` and transfer-hook variants. The 1.5.13 IDL has **no** `EvtMigrateMeteoraDamm` event; migration is evidenced by the decoded instruction name (`migrationDammV2`, `migrateMeteoraDamm`) and the pool's `is_migrated` flag. Coverage is a bounded recent window and never claimed as full history. When the window contains the pool's `EvtInitializePool`, the page links to its Launch Proof.

No durable index table was added in v2; reads are on demand. A durable append-only index (unique `(network, signature, event_index)`) is a future step.

## Open Proof API

`GET /api/public/meteora/v1/pools/{network}/{pool}`

| Query         | Meaning                               |
| ------------- | ------------------------------------- |
| `amountIn`    | Atomic units; enables a quote         |
| `direction`   | `buy` (quote→base, default) or `sell` |
| `slippageBps` | 0..5000, default 100                  |
| `timeline=1`  | Include bounded timeline              |
| `limit`       | 1..25, default 20                     |
| `before`      | Signature cursor                      |

Unknown parameters return 400. Responses carry `apiVersion`, `lifecycleVersion`, `snapshot` (with `provenance.evidence` per section), `quote`, `timeline`, and `digest` = SHA-256 over `qli.meteora-lifecycle/v2/snapshot\n` + canonical sorted-key JSON of the snapshot (tamper-evident, not a signature). Errors: 400 `VALIDATION_ERROR`, 404 `NOT_FOUND`, 422 `NOT_DBC_POOL`/`WRONG_NETWORK`/`CONFIG_MISMATCH`/`DECODE_FAILED`, 429 `RATE_LIMITED`, 503 `RPC_UNAVAILABLE`. CORS allows `GET, OPTIONS` from any origin because the data is public chain state. Rate limiting is best effort, per worker isolate (20/min per IP) with a 15 s cache; the RPC provider's limits remain the hard cap.

```sh
curl "https://quantumqli.app/api/public/meteora/v1/pools/devnet/GgCerxvd5myhq8ifQqFZqSacnHwemByjdkczUftDm5Qj?amountIn=10000000&timeline=1"
```

Deprecation: breaking changes ship under a new path prefix (`/meteora/v2`); `v1` keeps its field names and is announced in the changelog at least one release before removal.

## Analysis

Explanations are deterministic sentences built from the snapshot and timeline. No hosted model is called from this public page. Hugging Face status is shown via the existing public status endpoint; hosted analysis remains on the signed-in Neural Engine with owner consent and caps.

## Tests

`src/test/lifecycle.test.ts` (offline; fixture bytes from a third-party devnet pool, labelled fixture) and opt-in `QLI_LIVE_RPC=1 bunx vitest run src/test/lifecycle-live.test.ts` (observed devnet chain).