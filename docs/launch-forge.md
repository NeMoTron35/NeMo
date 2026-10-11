---
id: launch-forge
title: Launch Forge
group: Operations
summary: Seven-stage Standard and Quantum Meteora DBC launch planning.
---

# Launch Forge

## Seven stages

1. **Asset:** image preview, metadata URI, name, ticker, description, links, token properties and supply. Local image selection previews PNG/JPEG/WebP up to 5 MB; it does not upload to permanent storage. Supply a suitable public metadata URI separately.
2. **Curve:** draft builder, initial and migration targets and curve parameters.
3. **Fees:** starting/ending fees, scheduler, dynamic fees, collection mode and creator share.
4. **Migration:** DAMM v2 only; liquidity allocation, locks, vesting and leftover receiver inputs.
5. **Quote Market:** crypto quotes, custom mint or a tokenized-market preset. RPC verification determines mint decimals and reports validation errors.
6. **First Buy:** no first buy, creator, partner or combined preview with amount.
7. **Review:** method plan, account requirements, checkpoint count and public metadata preview.

## Standard versus Quantum

Standard prepares a DBC launch plan without an attestation. Quantum requires an open identity. WOTS reference sealing consumes a one-time leaf and places public proof material under the existing versioned launch domain in metadata extensions. Other signature choices are selectable but cannot produce launch certificates yet. Standalone ML-DSA and SLH-DSA workbench support is not launch-certificate integration.

## Exact seal scope

The current `launchDigest` canonicalizes version, mode, name, symbol, metadata URI, decimals, supply, quote mint, DBC program and DAMM v2 migration identifier. It does **not** commit to every curve, fee, social-link or first-buy input. Do not interpret a valid seal as approval of the entire economic configuration.

## Quote limitations

The 61 xStocks presets are a snapshot, not live eligibility or issuer approval. Validate mints on-chain, decimals, token-badge requirements and jurisdiction/transfer restrictions. No unverified Ondo address is automatically supplied.

## No deployment implied

Review generation does not generate live config/base-mint keypairs, sign a launch or submit transactions. Estimates may require RPC. Live construction remains blocked by the adapter requirements.