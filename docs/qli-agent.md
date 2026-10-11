---
id: qli-agent
title: QLi Agent
group: Operations
summary: Session-only read-only observer with rule-based alerts and wallet-approved Flywheel proposals.
---

# QLi Agent

> QLi Agent observes live data and prepares proposals. Every transaction requires fresh wallet review/approval. Quantum Authorization is application-enforced, not on-chain protection.

QLi Agent lives at `/qli-agent`. It is separate from the older **QLi Operator** (`/agent`), which only previews strategies against demo reserves.

## What it does

1. Connect a Wallet Standard wallet (for example Phantom) and create an agent bound to your public wallet, the current network and its genesis hash, and optionally your open Quantum Identity root.
2. List up to five Meteora DBC pools you created. Each read uses the same `loadFlywheelPool` check as the Flywheel: if the connected wallet is not the pool creator, the read fails and the agent pauses.
3. At your cadence (30–600 s) it reads claimable creator fees, migration state, curve progress (`quoteReserve / migrationQuoteThreshold`, shown as **Unknown** when not readable), wallet SOL, own-token balance and supply.

## Abilities (deterministic rules)

| Ability             | Rule                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Launch Watcher      | Migrated flag; rejects reads whose wallet/creator/network differ; stale-read alerts                   |
| Liquidity Sentinel  | Curve progress ≥ alert %; unknown progress; wallet SOL below reserve                                  |
| Flywheel Strategist | Claim when fees ≥ threshold; buyback = fee share capped by max proposal and reserve; burn held tokens |

Every alert shows its logic and read time. No price, APY or yield is inferred. Analysis is rules-based; optional AI summaries are **not configured** in this release, and any future model output is validated as display text only.

## Proposals and handoff

Proposals are typed, non-executable records (one step, pool, network, creator, amount, slippage, rationale, provenance, timestamp). **Review in Flywheel** passes the proposal through in-memory session state (never the URL). The Flywheel re-validates it strictly (wallet, network/genesis, freshness ≤ 300 s, bounded amounts, no extra fields such as transaction bytes), only prefills inputs, then you verify the pool, build, simulate, pass the optional Quantum Authorization gate and approve in your wallet as usual. **Deny** discards a proposal.

## Runtime truth

Session-only observer; pauses when browser closes. Polling also pauses when the tab is hidden, the wallet disconnects or changes, the network or RPC changes, or any read errors. There is no background worker, server signer or durable storage; profiles, observations and proposals live only in the tab.

## v2 — persistent monitoring (backend)

> QLi Agent continuously monitors only when verified server worker is healthy. It never moves funds. Every transaction requires fresh wallet approval. Quantum Authorization remains application-level, not on-chain enforcement.

- **Sign-in:** the server issues a single-use nonce bound to site domain, wallet, network, genesis and a 5-minute expiry. Your wallet signs the message (no transaction); the server verifies the ed25519 signature, consumes the nonce atomically and issues a 4-hour session token kept only in page memory. Challenges are rate-limited per wallet.
- **Ownership:** all agent tables are backend-only (no browser access). Every request verifies the session and filters by its wallet and network. Pool registration re-reads the pool server-side and refuses unless your wallet is its creator. Max 5 pools.
- **Worker:** a scheduled job calls the worker every 5 minutes. It takes a lease (no overlapping runs), checks up to 20 due pools with 3 in parallel, retries with jitter, backs off failing pools, records safe error categories only, and prunes old data (observations 30 days, alerts 90 days).
- **Status badge:** "Verified" appears only when the schedule exists and a run succeeded within 15 minutes; otherwise the page says monitoring is not verified.
- **Proposals:** stored proposals are evidence only. "Re-read live & review" performs a fresh read in your browser, re-runs the rules and hands the fresh proposal to Flywheel through the strict v1 handoff.
- **Notifications:** in-app only, shown on your next visit. No email or webhook.
- **AI:** none configured; analysis is rules-based.
- **Delete:** "Delete agent & history" removes the profile and all its pools, observations, alerts and proposals.

## Vault Sentinel (read-only)

`src/lib/qli-core/vault-sentinel.ts` analyses verified vault snapshots: paused, ≥80% fixed-window usage, nonce jump, stale read, slot regression, upgrade-authority/program change, mint/owner/destination change, duplicates, with dedup keys and BigInt-exact formatting. Proposals are typed, `executable: false`, carry no transaction bytes. With no verified deployment it shows "Ready for first devnet vault". **The scheduled worker does not read vaults; no persistence tables were added (NOT COMPLETE).**

### Persisted vault monitoring (added)

Tables `qli_monitored_vaults`, `qli_vault_observations` (u64 values as decimal strings), `qli_vault_alerts` (unique per vault + dedup key) are service-role only (anon/authenticated revoked), 3 vaults per profile, 30/90-day retention. Register/remove/state calls require the existing wallet-signed session; registration re-reads devnet and requires the session wallet to equal the on-chain vault owner, after full deployment attestation (genesis, loader, ProgramData, authority, bytecode, PDA, mint, escrow, destination, version). The worker route runs a separate vault sweep stage (monotonic slots, backoff, drift alerts, no signing) that reports `inactive` and reads nothing while `QUANTUM_VAULT_DEPLOYMENT` is null — which it is today. No always-on vault coverage is claimed.