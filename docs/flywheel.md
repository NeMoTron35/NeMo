---
id: flywheel
title: Quantum Flywheel Engine
group: Operations
summary: Wallet-approved claim, buyback and burn on your own DBC pool, plus hypothetical scenarios.
---

# Quantum Flywheel Engine

Open `/flywheel`. The page has two parts.

## Live cycle (real transactions)

1. Connect your wallet and enter the address of a Meteora DBC pool you created. The pool is read on-chain; if your wallet is not its creator the cycle is blocked.
2. **Claim fees** builds the SDK creator trading-fee claim.
3. **Buy back** swaps SOL for your token on the same pool, using an on-chain quote, a minimum-out slippage bound and a per-transaction cap (hard ceiling 10 SOL). Migrated pools and non-SOL quotes are blocked.
4. **Burn** builds an SPL Token `BurnChecked` from your token account, up to your balance.

Each step is program-allowlisted (DBC, System, SPL Token, Token-2022, Associated Token, Compute Budget), requires your wallet as the only signer, is simulated, and is shown for review. Mainnet requires an extra confirmation. Your wallet signs, the bytes are checked against the reviewed message, and the transaction is sent once and confirmed. Afterwards balances, supply and claimable fees are re-read; only then is the ledger row marked "Verified on-chain". Any change to inputs, network, RPC or wallet discards a reviewed transaction, including while the wallet popup is open.

There is no schedule, automation or server signer. Burns are permanent and do not guarantee any price effect.

## Scenario tools (hypothetical)

Allocation presets, the fee wheel, projections and proposal digests are user-entered models. The buyback share only suggests an amount in the live form; it is not on-chain fee routing.

## Optional Quantum Authorization gate

Application-level authorization only — not on-chain enforced. Other clients and directly signed transactions can bypass this additional gate.

If you enable the policy in `/authorization`, an eligible step (optionally buybacks above a threshold) shows a gate after review. You sign a canonical authorization intent with the next unused leaf of your reference Quantum Identity. The intent binds operation, network and genesis hash, wallet, identity root, pool, creator, mint, recipient, amount in base units, max spend, slippage, minimum out, the SHA-256 of the reviewed transaction message, blockhash, last valid block height, expiry and a random nonce. The proof is re-verified immediately before the wallet is asked to sign; if anything changed, or it expired, was replayed in this session, or comes from the public demo, wallet approval is blocked. Any change to inputs, network, RPC, wallet, identity or policy, or a rebuild (new quote/blockhash/bytes), invalidates it. The wallet still approves the actual bytes. A record is marked "Executed on-chain" only after confirmation and re-reads. With the policy off, nothing changes.

## QLi Agent handoff

QLi Agent (`/qli-agent`) can suggest one Flywheel step. The suggestion only prefills inputs after strict validation (wallet, network/genesis, freshness, bounded amounts, no transaction bytes). The pool is re-read and the transaction rebuilt, simulated, optionally Quantum-Authorized and wallet-approved exactly as for manual use.
