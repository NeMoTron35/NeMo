# Dependency audit status

Run `bun run audit:dependencies` to check every exact version recorded in the Bun lockfile against npm's public advisory service. Each advisory's `vulnerable_versions` range is matched against each locked version with `semver`; nothing is ignored, filtered or waived. The audit submits only public package names and versions, needs no repository secrets and fails on any high/critical finding.

Status on October 10, 2026: **0 critical, 0 high, 0 moderate, 0 low** across 609 locked package names.

## How each former advisory was resolved

| Advisory package                                    | Parent chain                                                                                        | Resolution                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bigint-buffer@1.1.5` (high, GHSA-3gc7-fjrx-p6mg)   | `@meteora-ag/dynamic-bonding-curve-sdk` → `@solana/spl-token` → `@solana/buffer-layout-utils@0.3.0` | No fixed upstream release exists. Replaced via override with the first-party pure-JavaScript, bounds-checked workspace package `packages/bigint-buffer-js` (`@quantum-qli/bigint-buffer-js`). It has no native binding, so the overflow path does not exist. Tests prove Solana `u64`/`u128` layouts round-trip through it. |
| `toml@3.0.0` (high ×2)                              | Meteora DBC SDK → `@coral-xyz/anchor@0.31.1`                                                        | Override to fixed `toml@4.3.0`; same CommonJS `parse` API. Only Anchor's Node workspace loader uses it; the browser bundle does not.                                                                                                                                                                                        |
| `uuid@8.3.2` (moderate)                             | `@solana/web3.js` → `jayson@4.3.0`                                                                  | Override to fixed `uuid@11.1.1`, which keeps the CommonJS `v4` export jayson uses.                                                                                                                                                                                                                                          |
| `brace-expansion@1.1.16` / `@5.0.8` (high/moderate) | ESLint → `minimatch@3`; typescript-eslint → `minimatch@10`                                          | Lockfile regenerated so both majors resolve to their fixed patch releases inside the existing semver ranges.                                                                                                                                                                                                                |
| `esbuild` (moderate)                                | `drizzle-kit` (unused, empty scaffold)                                                              | Removed `drizzle-kit`, `drizzle-orm`, `postgres` and the empty `drizzle/` scaffold.                                                                                                                                                                                                                                         |

Unused UI scaffolding (accordion, calendar, carousel, chart, command, drawer, form, sidebar and similar) and their 33 packages were also removed; the app renders only the button, dialog, switch and tooltip primitives.

Install scripts are not needed for the replacement package. Bun's `hoisted` linker keeps a flat `node_modules` with the local workspace package.

## Update automation

Dependabot tracks GitHub Actions. Bun dependency updates are reviewed separately because the repository intentionally overrides an upstream vulnerable package with a local workspace replacement; the scheduled `audit:dependencies` workflow still checks every locked package version against the public advisory service.

