---
id: qli-data-engine
title: QLi Data Engine
group: Operations
summary: How QLi Agent v2 reads, records and evaluates verified on-chain pool state.
---

# QLi Data Engine

The data engine reuses the same verified Meteora DBC reader as the Flywheel (`loadFlywheelPool`, `readFlywheelBalances`): the pool account must be owned by the DBC program and its `creator` must equal the owner's signed-in wallet.

## What is recorded

| Field                                 | Source                                   | Notes                                                                                                         |
| ------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| creator, pool, base/quote mint        | DBC virtual pool + config                | Creator mismatch refuses the read                                                                             |
| migration flag                        | `virtualPool.isMigrated`                 |                                                                                                               |
| claimable creator fees                | `creatorQuoteFee`, `creatorBaseFee`      | base units                                                                                                    |
| curve progress                        | `quoteReserve / migrationQuoteThreshold` | **Unknown** when either is unreadable; this is the curve's virtual accounting, not an actual liquidity figure |
| wallet SOL, own-token balance, supply | RPC `confirmed` reads                    |                                                                                                               |
| slot                                  | `getSlot("confirmed")` before reads      | Observation is "at or after" that slot                                                                        |

Each observation stores provider name (never a key or URL query), mode (`scheduled` or `live`), slot and time. No price, APY, volume or reserve value is invented.

## Ordering and duplicates

Observations are unique per pool and slot; a read at a slot not newer than the last recorded slot is dropped. Reads use `confirmed` commitment, so a later fork could differ; alerts and proposals carry their slot as evidence and every action is re-read live in Flywheel before building. Outages are recovered by processing overdue pools on the next run; intermediate states during an outage are not reconstructed.

## Rules

Threshold arithmetic uses integer lamports (`toBaseUnits` on a fixed 9-decimal string). Alerts and proposals are deduplicated by rule within the owner's cooldown window (default 6 hours) to prevent spam.

## Server RPC

The worker uses a server-managed endpoint only: `QLI_AGENT_RPC_MAINNET` / `QLI_AGENT_RPC_DEVNET` when set to an allowlisted HTTPS host, otherwise the public Solana endpoints (which may rate-limit or refuse mainnet reads). User input never selects the worker endpoint.