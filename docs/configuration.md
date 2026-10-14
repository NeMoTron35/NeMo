---
id: configuration
title: Configuration and environment
group: Developers
summary: Names only; hosted integration values stay managed and private.
---

# Configuration and environment

## Product configuration

Network, commitment, public RPC URL, priority fee, slippage and provenance preferences are selected in System and held in the console session. The DBC program and protocol domains are source constants. The Quantum Wallet verifier program id is intentionally null; setting a random program id is not deployment.

## Environment names present in current integration code

| Name                            | Role                                                     |
| ------------------------------- | -------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Browser-visible managed service location                 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-visible publishable integration key              |
| `SUPABASE_URL`                  | Server integration location                              |
| `SUPABASE_PUBLISHABLE_KEY`      | Server publishable integration key                       |
| `SUPABASE_SERVICE_ROLE_KEY`     | Privileged server-only client support; not a browser key |
| `QLI_CRON_SECRET`               | Server-only cron authorization helper                    |
| `QLI_CRON_SECRET_PREVIOUS`      | Previous-secret rotation support                         |

These names identify generated integration support, not a requirement to manually add every value for demo tools. The product public crypto routes do not use cron authorization. No separate AI, trading-feed or deployed verifier configuration is present. Do not infer provider settings from environment names alone.

## Secret handling

Never prefix private secrets with `VITE_`, commit them, print them or place them in documentation. Configure server secrets through the deployment environment's secret store. Privileged clients must remain server-only and must not be used for ordinary user reads. This guide intentionally contains no environment values or sample credentials. Browser sessions use same-origin storage; no session is forwarded to an editor or another origin. JavaScript-readable session storage still requires strong XSS prevention.
