# QLi Launch Proof Engine v1

Public, read-only verification of a Meteora DBC launch from Solana RPC evidence. Routes: `/launch-proofs` (lookup and receipt check) and `/launch-proofs/$network/$signature` (shareable proof page). The proof pages never ask a wallet to sign, never build transactions and never broadcast.

## Verification steps

1. Input: network must be `mainnet-beta` or `devnet`; the signature must decode from base58 to exactly 64 bytes. Other values are rejected before any RPC call.
2. RPC: server-trusted endpoints only (`QLI_AGENT_RPC_MAINNET` / `QLI_AGENT_RPC_DEVNET` if HTTPS and on the host allowlist, otherwise the public Solana endpoint). Visitors cannot supply an RPC URL. Each call has a 10 s timeout and no automatic retry on 429.
3. Genesis hash must match the selected network.
4. `getSignatureStatuses` (history search): missing = not found; error = failed; `processed` = pending. Only `confirmed` or `finalized` continue.
5. `getTransaction` (v0, loaded addresses resolved): must succeed, invoke `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` and log `InitializeVirtualPoolWithSplToken` or `...Token2022`. Any other successful DBC transaction (swap, claim, config only) is reported as not a launch.
6. Pool candidates: writable, non-signer accounts referenced by DBC instructions with zero lamports before and a balance after the transaction (created in this transaction). At most 12; more is refused as oversized. One batched account read.
7. Each candidate must be owned by the DBC program and decode as `virtualPool` with the SDK's Anchor coder (discriminator checked). Zero = incomplete link; more than one = ambiguous. The engine never guesses.
8. The pool's config must appear in the transaction, be DBC-owned and decode as `poolConfig`. `deriveDbcPoolAddress(quoteMint, baseMint, config)` must equal the pool. The pool creator must have signed the transaction. The base mint must appear in the transaction.
9. Reported facts: pool, config (and whether it was created in this transaction), base mint (and whether it was created), quote mint, creator, migration target (DAMM v1/v2).

Failure states: invalid input, not found, pending, failed, RPC unavailable, rate limited (429/403), wrong genesis, not a DBC launch, incomplete link, ambiguous, account mismatch, oversized. No receipt is issued for any of them.

## Receipt

`digest = sha256("qli.launch-proof/v1/receipt\n" + canonicalJson(body))`, canonical JSON with sorted keys and no whitespace. The body holds version, domain, `evidenceClass: "confirmed-on-chain"`, network, genesis, signature, slot, block time, `txError: null`, observed commitment, verification time, the facts above, `intentLinkage: "unverified"` and `attestation: "local-integrity-checksum-not-signed"`.

The digest is a local integrity checksum: it shows a receipt was not edited after export. It is not a signature, an oracle attestation or an on-chain proof. Anyone can recompute it on `/launch-proofs`; to re-verify chain state, run the lookup again.

## Evidence classes

- Confirmed on-chain fact: the receipt body.
- Reviewed launch intent: a hash of the Launch Forge review saved in this browser's session storage only (max 10 entries; signature, network, intent hash, symbol, time; no keys or metadata). No intent hash is embedded or signed on-chain, so the page always shows "intent linkage unverified".
- Interpretation: deterministic reserve reading at the account-read slot, Shadow constant-product stress (hypothetical / uncalibrated, not DBC curve math) and hosted-model status. None of these are part of the receipt. Threat Graph data is owner-scoped and is never shown on public proof pages. Hugging Face shows "not configured / deterministic only" unless the operator has configured it.

## Limits

- Cache: per server instance, 5 minutes for verified/failed, 10 seconds otherwise; RPC errors are not cached.
- Rate limit: 12 lookups per minute per client IP, per server instance (best effort; the RPC provider's own limits still apply).

## Tests

- `src/test/launch-proof.test.ts`: valid launch, every failure state, spoofed owner, pre-existing pool, derivation/creator/config mismatches, ambiguity, candidate bound, tampered receipts, intent storage bounds, real SDK coder, rate limiter.
- `QLI_LIVE_RPC=1 bunx vitest run src/test/launch-proof-live.test.ts`: read-only check against public devnet using a third-party DBC pool creation (verified on 2026-10-11) and a wrong-network rejection.

A QLi Launch Forge launch on devnet has not yet been verified with this engine; see `docs/LAUNCH_DEPLOYMENT_CHECKLIST.md`.