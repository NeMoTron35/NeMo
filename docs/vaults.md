---
id: vaults
title: Vault prototypes, backup and recovery
group: Public surfaces
summary: Local ML-DSA keys and explicitly undeployed custody flows.
---

# Vault prototypes, backup and recovery

## Vault Desk and My Vaults & Key

`/vault` summarizes readiness and available wallet data. `/vaults` generates a local ML-DSA-65 key and public fingerprint. Keys and the seed remain in the provider’s tab memory. The explicit backup flow displays a 64-character hexadecimal seed; record it privately offline. Never paste it into support, chat, API requests or a cloud clipboard.

Restore validates the 64-hex seed and regenerates the same public fingerprint. Refresh or closing the tab loses the local key. Clear explicitly zeros the stored seed/secret-key byte arrays and drops references; unmount also zeros those buffers. Immutable strings and compromised-device memory are outside this guarantee.

## Deposit and withdrawal

`/deposit` offers amount and availability/readiness controls but no live vault deposit. `/withdraw` can sign and verify a local withdrawal message using the tab key; submission is unavailable. A verified local signature does not move assets.

## Quantum Wallets reference model

`/quantum-wallets` demonstrates WOTS vault-chain ordering, recipient/mint/amount commitments, chunk staging and remainder rollover. This is distinct from the ML-DSA prototype. The Quantum Wallet program id is null; live adapter construction throws rather than using another program.

## Recovery and loss

There is no administrator recovery, server key store or custody backdoor. Without the offline ML-DSA seed, the prototype key cannot be restored. No deployed Quantum QLi vault receives funds in this build, so prototype key loss does not strand a Quantum QLi vault deposit.

## Quantum Vault Protocol (separate)

`/quantum-vault` describes a distinct Phase 1 Solana program with on-chain withdrawal limits. It is unaudited and not deployed, so its deposit/withdraw controls are disabled. The prototypes on this page are not connected to it.
