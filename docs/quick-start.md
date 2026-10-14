---
id: quick-start
title: Quick start
group: Start here
summary: A safe first session without funds or private keys.
---

# Quick start

## Explore without a wallet

1. Open QLi Desk at `/` and run a Cryptography Workbench signature test.
2. Enable message modification and run again: the expected mismatch demonstrates tamper detection.
3. Open Quantum Identity at `/identity` and choose the public demo identity. Its secret is published; never use it live.
4. Register locally, then produce a possession proof. Registration consumes leaf zero; each proof consumes another leaf.
5. Open Proof Inspector at `/verify` and compare valid and tampered examples.

## Draft a launch

Open Launch Forge at `/launch`. Enter asset details, proceed through Curve, Fees, Migration, Quote Market and First Buy, then Review. Standard mode does not attach a seal. Quantum mode requires an open identity and currently seals only with reference WOTS. The resulting review is a simulation plan, not a token deployment.

## Connect deliberately

Choose Wallet in the desktop bar. Select a detected Solana Wallet Standard wallet. Use System to select the intended network and a public HTTPS RPC. A connection itself moves no funds. See [Wallet and transaction review](/docs?article=wallet-flow).

## Session lifetime

Navigation preserves shared session state. A refresh clears strategies, plans and in-memory keys. Reference WOTS consumed-leaf records remain in browser storage; public-demo ledgers do not. Read [Security model](/docs?article=security) before using reference identities.
