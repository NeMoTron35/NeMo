---
id: wallet-flow
title: Wallet and transaction flow
group: Security and protocol
summary: Client-side authorization with review and simulation, never hidden submission.
---

# Wallet and transaction flow

## Connection

Quantum QLi detects Solana Wallet Standard wallets after hydration, shows connection status/errors and lets the user connect/disconnect. Compatible wallets must expose the required message or transaction signing feature. No email/password account flow is used by these product pages.

## Reviewed transaction boundary

1. An invoked DBC service builds/prepares an unsigned transaction with fee payer and recent blockhash.
2. The reviewed message bytes are copied/frozen.
3. Signing verifies the connected account, supported network, fee payer and RPC genesis hash.
4. Blockhash validity/height is checked. Simulation uses the same blockhash, with replacement disabled.
5. The adapter rechecks expiry, message bytes and wallet before requesting a signature.
6. Returned bytes must preserve the reviewed message and contain a valid payer signature.
7. The adapter returns signed bytes; **it does not submit**.

## Current UI boundary

The general Review dialog handles simulation/demo plans, not live signing or submission. Identity Anchor is a distinct prepare/simulate/local-sign path that also stops before submission. No current launch UI broadcasts a token deployment.

## Message signing

Identity derivation and local withdrawal proofs are not transactions. Verify the message and domain before approving. Connection, a PASS badge or a local signature is not on-chain success.
