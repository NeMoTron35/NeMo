---
id: architecture
title: Architecture and contributor map
group: Developers
summary: Where routes, UI, adapters, crypto and documentation live.
---

# Architecture and contributor map

## Routing and shared state

File-based TanStack routes live in `src/routes/`. `src/routes/__root.tsx` owns providers, desktop Shell, Outlet and transaction review. `src/router.tsx` creates the router; `src/routeTree.gen.ts` is generated and must not be edited. Every content route has app-specific metadata from `src/lib/quantek/data.ts`.

## Code map

| Path                                                                              | Responsibility                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `src/components/quantek/shell.tsx`                                                | Global menus, sources, toolbar, Dock and public session console           |
| `src/components/qli/desktop-window.tsx`                                           | Bounded frontend window movement/focus support                            |
| `src/lib/quantek/context.tsx`                                                     | Request-isolated console session, wallet, identity and reviewed plans     |
| `src/lib/quantek/repository.ts`                                                   | Typed demo/session strategy repository                                    |
| `src/components/quantek/agent.tsx`, `launch.tsx`, `markets.tsx`, `operations.tsx` | Retained operations tools                                                 |
| `src/lib/quantek/dbc.ts`                                                          | Invoked Meteora client/services, reads and transaction preparation        |
| `src/lib/quantek/wallet.ts`                                                       | Reviewed wallet signing and derivation-message verification               |
| `src/lib/quantek/pq.ts`                                                           | Hash-signature primitives, domains and public proof verification          |
| `src/lib/quantek/identity.ts`                                                     | Derivation, Merkle tree, ledger, challenge and memo                       |
| `src/lib/quantek/quantum-wallet.ts`                                               | WOTS vault model and fail-closed undeployed adapter                       |
| `src/lib/qli/crypto.ts`, `vault.tsx`                                              | Standard PQ workbench and local ML-DSA key provider                       |
| `src/lib/qli/market.ts`, `src/components/qli/markets.tsx`                         | Explicit demo market adapter/public market UI                             |
| `src/lib/qli/api.ts`, `src/routes/api/public/v1/$.ts`                             | Bounded public crypto API and lazy handler boundary                       |
| `src/start.ts`, `src/server.ts`                                                   | Server middleware and SSR error handling                                  |
| `src/lib/auth/`                                                                   | First-party same-origin browser auth client and session-header middleware |
| `src/integrations/supabase/`                                                      | Backend types, authorization and server-only integration support          |
| `src/styles.css`                                                                  | Shared semantic theme, classic desktop and documentation styles           |
| `docs/`, `src/lib/qli/documentation.ts`                                           | Markdown single source and browser-safe documentation catalog             |
| `src/components/quantek/docs.tsx`                                                 | Searchable first-party help reader                                        |
| `src/test/`                                                                       | Routing, parity, wallet, proof, adapter and docs regressions              |

## Contributor invariants

Never feed fabricated demo addresses to live signing. Initialize service clients inside invoked factories. Keep cryptographic secrets out of persistence, logs, APIs and utility output. Preserve versioned qtk1/domain/ledger encodings through branding changes. Do not enable custody merely by changing a null constant. Do not introduce a second router or edit the generated route tree.

Read root `AGENTS.md` before making structural changes. Documentation Markdown is bundled as text, not executed code; raw HTML is not rendered by the help reader.
