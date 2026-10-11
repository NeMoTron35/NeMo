---
id: deployment
title: Deployment notes
group: Developers
summary: Worker-compatible build with deliberate noncustodial boundaries.
---

# Deployment notes

## Current target

The first-party Vite configuration composes TanStack Start, React, Tailwind, TypeScript paths and build-only Nitro targeting Cloudflare Workers with Node compatibility enabled. It preserves the custom `src/server.ts` entry. `src/start.ts` installs error middleware, server-function CSRF handling and same-origin session auth-attaching middleware. Deployment is a separate action; this guide does not claim the app is already deployed.

## Runtime compatibility

Published server code runs in a Worker runtime, not Node. `vite.config.ts` aliases rpc-websockets and selected Solana codec/error/option packages to browser bundles because their export conditions do not expose a Worker entry. Preserve those aliases and the configured framework plugins. Browser wallet discovery/crypto interaction must remain after hydration or user interaction.

## Before production use

- Verify all route metadata and public API responses on the deployed origin.
- Run tests and wallet/RPC checks on the intended network.
- Define an authenticated metadata persistence model if session settings or strategies must survive refresh; exclude secrets.
- Supply and independently review actual live market/trading adapters before offering executable orders.
- Specify, audit and deploy a verifier program before enabling quantum vault transactions.
- Evaluate public API rate limits/abuse controls and monitoring separately; current worker history is volatile.

## Not supplied

No provider-independent deployment CLI, custody service, production launch broadcast flow or deployed verifier is configured by the docs. A successful build is not an audit or a funds-safety guarantee.