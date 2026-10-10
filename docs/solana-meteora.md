---
id: solana-meteora
title: Solana and Meteora DBC
group: Security and protocol
summary: The actual account, quote, migration and fee-claim concepts.
---

# Solana and Meteora DBC

## Solana essentials

A wallet account authorizes transactions with ed25519. A mint identifies a token and its decimals. RPC supplies chain reads, blockhash, fee estimates and simulation; commitment expresses processed, confirmed or finalized reads. Recent blockhash validity limits transaction lifetime. SOL fees and rent estimates require actual accounts and RPC; sample costs are not quotes.

## Meteora DBC

The app uses `@meteora-ag/dynamic-bonding-curve-sdk` with the DBC program `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`. A config describes curve/fees/migration; a pool uses that config and a quote mint. The service factory exposes config/pool construction, first-buy variants, pool/config/progress/fee reads, creator/partner fee claims and DAMM v2 migration.

## Migration and quotes

Only `MigrationOption.MET_DAMM_V2` is offered. Tokenized or custom quote mint selection requires on-chain validation and may require a token badge/remaining account. A catalog listing is not permission or regulatory eligibility.

## Reference anchor

An SPL Memo can publish public identity material. The current Anchor page prepares, simulates and signs but never submits. No observed confirmation means no public anchor.