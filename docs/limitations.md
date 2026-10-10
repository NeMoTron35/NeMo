---
id: limitations
title: Known limitations and adapter boundaries
group: Reference
summary: What is demonstrated, read-only, local or genuinely unavailable.
---

# Known limitations and adapter boundaries

## Current capability matrix

| Capability                                         | State                                               |
| -------------------------------------------------- | --------------------------------------------------- |
| Standard PQ signing / decapsulation                | Real browser-local workbench operations             |
| Public verify / encapsulate API                    | Implemented with public material and bounded bodies |
| Wallet connection and readonly reads               | Browser-wallet/RPC dependent                        |
| Reference identity derive/register/prove           | Implemented locally; no global registry             |
| Reference SPL Memo anchor                          | Prepare/simulate/sign only, no submission           |
| WOTS launch seal                                   | Reference proof over a limited canonical field set  |
| Other launch signature certificates                | Not integrated despite selectable schemes           |
| DBC launch UI                                      | Draft/validation/review only, no launch broadcast   |
| Operator modes / liquidity / positions / fees      | Demo/session previews, no unattended execution      |
| Live market provider / swaps                       | Unavailable; explicit demo adapter only             |
| ML-DSA vault key and local withdraw signature      | Implemented locally, no custody                     |
| WOTS vault-chain / staging                         | Reference model, verifier program null              |
| Vault creation / deposit / withdrawal              | Live execution unavailable                          |
| Custodial keys / server sign / decapsulate / usage | 501 unavailable public API operations               |
| Durable settings / strategies / audit              | Not implemented; session state only                 |
| Reference consumed-leaf ledger                     | Browser-local persistence, no synchronized lock     |
| Worker health history                              | Volatile observed checks, not uptime                |

## Interpretation rules

No fake transaction success, guaranteed yield, independent audit, deployed quantum custody or third-party proof compatibility is claimed. A service adapter or SDK method existing in source is not evidence that the UI invokes it live. A valid proof says nothing about the uncommitted economic inputs, actual asset ownership or chain confirmation.

## Production work remains explicit

Live provider integrations, reviewed launch broadcast, multi-device one-time-key enforcement, audited verifier deployment, secure metadata persistence and production operational monitoring require separate implementation and verification. These docs preserve current features without pretending those boundaries are complete.
