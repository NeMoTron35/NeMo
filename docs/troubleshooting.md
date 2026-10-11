---
id: troubleshooting
title: Troubleshooting
group: Start here
summary: Diagnose expected empty, unavailable and rejected states.
---

# Troubleshooting

## Wallet not listed or connected

Use a browser with a Solana Wallet Standard extension and check the wallet’s supported network/features. Connect deliberately and read the connection error. Headless browser tests do not supply an installed wallet. Never send support a seed, private key or derivation signature.

## RPC unavailable or wrong network

Check network/commitment and a public HTTPS RPC in System. Public RPCs may throttle or block requests. A genesis mismatch or blockhash error means rebuild/review on the correct network; never bypass the signing guard.

## Market empty / live unavailable

No live trading-feed provider is configured. Select the explicit demo adapter where offered. Demo market data cannot be submitted as a live trade.

## Identity proof or registration rejected

Register first: leaf zero is consumed for registration. Every reserved leaf is one-time; do not roll it back after failure. Reference ledger corruption, clearing or multi-device signing is unsafe. Exhaustion requires a fresh identity, not leaf reuse.

## Anchor says signed

That is the endpoint of the current flow: no submission or confirmation is available. Do not call it anchored. A demo identity cannot use the live anchor path.

## Vault creation / deposit / withdraw unavailable

This is an intentional boundary, not a missing wallet permission. No verifier is deployed. The local withdrawal signature is a readiness demonstration only.

## Key disappeared after refresh

Prototype keys are tab-memory only. Restore ML-DSA only from your privately recorded 64-hex seed. There is no server recovery. Reference identity re-derivation also requires the same derivation inputs and safe leaf history.

## Invalid API body

Check JSON content type, 64 KB maximum body, canonical base64, algorithm and decoded key/signature sizes. Do not supply secrets. A tampered valid-format signature may correctly return `valid: false`.

## Worker build cannot resolve Solana packages

Confirm the browser-bundle aliases in `vite.config.ts` and install the checked-in dependencies. Do not replace the TanStack bootstrap with a different router. Check current build diagnostics; a dev-server success alone is not Worker compatibility.

## Safe support information

Share the page name, public error message, selected network, expected versus observed behavior and request id where available. Redact credential-bearing URLs and never include secret material.