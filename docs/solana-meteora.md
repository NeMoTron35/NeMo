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

## On-chain launch (devnet)

The Launch Forge Review step builds one transaction with the SDK's `client.partner.createConfigAndPool` (SDK 1.5.13, program `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`). Config creation is permissionless: your connected wallet becomes payer, fee claimer, leftover receiver and pool creator, so no third party receives fees or authority. Token authority is immutable, the quote is wrapped SOL, migration targets DAMM v2, and first buy is not supported yet.

Before signing, the console checks the RPC genesis hash, that the DBC program is deployed, that the quote mint exists, that your metadata JSON matches name and symbol and has an https image, that the signer set is exactly your wallet plus the fresh config and mint keys, and that your SOL balance meets a rough fee-and-rent estimate. The estimate is a heuristic, not a guarantee; your wallet shows the final cost. The fresh keys sign locally in the tab and are discarded; they authorize nothing after the transaction.

After you approve in your wallet, the console simulates, rejects bytes your wallet changed, sends once with preflight, confirms against the reviewed blockhash and checks that the pool and config accounts are owned by the DBC program. Statuses are shown separately: built, awaiting wallet, submitted, confirmed, failed, expired.

Wizard settings that cannot be applied exactly (non-SOL quotes, Token-2022, vanity mints, fee schedulers, vesting, first buy) block the launch with a message instead of being silently dropped.

**Quantum Launch** is the same Meteora launch, allowed only when your metadata JSON contains an Attestation Seal proof that verifies: a reference-label WOTS/Merkle proof in the launch domain, whose signed message is exactly this launch's canonical data and whose recomputed root and public seed match your open Quantum Identity. Public-demo seals are refused. The seal covers name, symbol, metadata URI, decimals, supply, quote mint, DBC program and DAMM v2 migration — not curve, fees or liquidity. Metadata on an ordinary web host is labeled "not immutable". This is an attestation about launch data, not quantum-safe chain execution: Solana transactions are still authorized by ordinary ed25519 signatures.

Any change to launch settings, network, RPC, wallet account or identity after a build discards the reviewed transaction; you must build and review again. A signature that was already sent stays visible so you can track it.

**Mainnet** is available behind extra gates: full genesis-hash check, an allowlist of invoked programs, the exact signer set, simulation before the wallet prompt, a 0.1 SOL preflight spend threshold (not an on-chain cap) and a separate mainnet risk confirmation. It spends real SOL and cannot be undone; try devnet first. The public mainnet RPC is rate-limited — set your own RPC in System if you see HTTP 403/429.