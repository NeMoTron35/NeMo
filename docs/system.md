---
id: system
title: System
group: Workspace
summary: Network, RPC and preview-only policies saved for this session.
---

# System

Open `/settings`. Apply network, commitment, public HTTPS RPC URL, priority fee, slippage and provenance preference fields. The form validates the RPC and policy inputs. Successful save reports “Saved this session.”

## Limits and defaults

The session starts on mainnet-beta with confirmed commitment, priority 1000 micro-lamports/CU and slippage 50 bps. The policy form permits integer priority 0–10,000,000 and slippage 1–500 bps. Plans display explicit limits; these preferences are preview-only, not automatic transaction instructions. Editing PQ domain/version preferences does not rewrite fixed cryptographic domains used by existing proofs.

## Change network safely

Changing network or RPC clears open plans. Avoid credential-bearing RPC URLs: browser requests and user-visible configuration are not a private credential store.

## Reset simulation

Confirm reset to clear session events, strategies, policies, agent mode and plans. It does not change on-chain assets. It is not a cross-device wipe of reference leaf ledgers or a replacement for explicit key clearing.