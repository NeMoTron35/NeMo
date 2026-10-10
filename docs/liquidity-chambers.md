---
id: liquidity-chambers
title: Liquidity Chambers
group: Operations
summary: Inspect and filter demo DBC pools and open operation previews.
---

# Liquidity Chambers

Open `/pools` for the retained pool browser. Search, filters and pool selection work against demo repository records. Inspect curve reserves, fees and migration progress; open the available operation review rather than assuming the displayed mint/account labels are live.

## Protocol meaning

Meteora DBC represents virtual pools progressing along a bonding curve toward a quote threshold and migration. The application uses DAMM v2 migration planning only. The SDK services expose pool/config reads, progress and fee metrics, but the operational table is not automatically populated from a production indexer.

## Safety boundary

Demo addresses and balances must never enter the reviewed live transaction adapter. Rebalance and migration previews explain intended calls; they are not confirmed on-chain operations.