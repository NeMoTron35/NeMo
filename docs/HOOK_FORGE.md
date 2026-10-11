# QuantumQLi Hook Forge v1

Route: `/hook-forge`. Read-only policy workstation for Meteora DBC native configuration and Token-2022 TransferHook inspection. It never builds, signs or sends a transaction.

## What "hook" means here

- **TransferHook** is a Token-2022 mint extension: the Token-2022 program invokes a hook program on every **token transfer**. It is not a swap callback.
- Meteora DBC has no user-programmable swap callbacks. DBC "policies" are native config values (fees, curve, migration) enforced by the DBC program.
- This is not an EVM / Uniswap v4 hooks system and makes no equivalence claim.

## Enforcement classes

| Class               | Meaning                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| Meteora enforced    | Value lives in the DBC PoolConfig; immutable after config creation             |
| Token-2022 executed | Token-2022 calls a transfer-hook program on transfers                          |
| Operator monitored  | Off-chain, user-triggered dry run against RPC-verified snapshots; no scheduler |
| Advisory only       | Not deployable; no on-chain effect                                             |

## Supported SDK paths (pinned `@meteora-ag/dynamic-bonding-curve-sdk@1.5.13`)

- Base fee: flat, `FeeSchedulerLinear`, `FeeSchedulerExponential` (RateLimiter is deprecated for new configs and excluded). Bounds `MIN_FEE_BPS=25`, `MAX_FEE_BPS=9900`, periods ≤ u16, integer period frequency.
- Dynamic fee on/off, collect fee mode, creator trading fee %, `buildCurveWithMarketCap` milestones, `MigrationFeeOption` FixedBps25..600 (DAMM v2), activation slot/timestamp, locked vesting.
- Fee math (`scheduleParams`, `feeNumeratorAtPeriod`, `feeOnAmount`) is BigInt and parity-tested against SDK `getFeeSchedulerParams`, `getBaseFeeNumeratorByPeriod`, `getFeeOnAmount`.
- Launch-mappable (matches `curveConfig` in `dbc-launch.ts`) only when: flat fee, dynamic fee on, quote-token fee collection, `FixedBps100` DAMM v2 migration fee, timestamp activation, no locked vesting, SPL Token, and **no** transfer constraint or custom transfer hook requested. Anything else is **export plan only** (`deployableViaLaunchForge: false`). Even a mappable policy is never transferred: the user re-enters each value in Launch Forge, which re-validates, simulates and asks the wallet.

## Token-2022 inspector

Server function `inspectTransferHook` (`hook-forge.functions.ts` → `hook-forge.server.ts`): server-trusted RPC allowlist only, genesis check, fixed bounded reads (mint, hook program, extra-account-meta PDA, programdata). Decodes with `@solana/spl-token@0.4.14`. Reports extensions, hook program/authority, executability, upgrade authority, metas PDA existence, mint/freeze/permanent-delegate/transfer-fee authorities with source slot.
Missing, non-executable or unreadable hook programs, and high-risk extensions (permanent delegate, non-transferable), yield `blocked`. Upgrade authority that cannot be read is reported `unknown`. Verdicts are `not-verified`, `blocked` or `not-applicable` — never "compatible". The SDK exposes a `TransferHookPool` path (`createConfigWithTransferHook`, `swap2WithTransferHook`), but QLi does not build it and has no devnet evidence that any specific hook program works through DBC or DAMM v2 migration. Meta contents and hook runtime are not validated. Not an audit.

## Custom hook programs

Disabled. No audited program, independent review or positive devnet evidence exists. The "transfer constraint" template is reference-only.

## Manifest

Domain `QuantumQLi.HookForge.Manifest.v1`, SHA-256 over canonical sorted JSON. Integrity checksum only, not a signature or on-chain proof. Import validates version, schema, size, secret-like content and digest.

```json
{
  "version": "qli-hook-forge/v1",
  "kind": "qli-hook-forge-manifest",
  "sdk": "@meteora-ag/dynamic-bonding-curve-sdk@1.5.13",
  "createdAt": "2026-10-11T00:00:00.000Z",
  "integrity": "sha256 integrity checksum, not a signature or on-chain proof",
  "policies": [
    {
      "version": "qli-hook-forge/v1",
      "name": "Native flat fee",
      "activationType": "timestamp",
      "baseFee": {
        "mode": "flat",
        "startingBps": 100,
        "endingBps": 100,
        "numberOfPeriod": 0,
        "totalDuration": 0
      },
      "dynamicFee": true,
      "collectFeeMode": "quote",
      "creatorTradingFeePercent": 50,
      "tokenType": "spl",
      "totalTokenSupply": 1000000000,
      "initialMarketCap": 30,
      "migrationMarketCap": 540,
      "migrationFeeOption": "FixedBps100",
      "lockedVesting": {
        "totalLockedVestingAmount": 0,
        "numberOfVestingPeriod": 0,
        "cliffUnlockAmount": 0,
        "totalVestingDuration": 0,
        "cliffDurationFromMigrationTime": 0
      },
      "advisory": { "transferConstraint": false, "customTransferHook": false }
    }
  ],
  "classification": [
    { "name": "Native flat fee", "deployableViaLaunchForge": true, "findings": [] }
  ],
  "digest": "<64 hex>"
}
```

## Developer API

`src/lib/qli-core/hook-forge.ts`: `policySchema`, `HookPolicy`, `validatePolicy`, `classifyParams`, `launchMappable`, `feeSchedule`, `compareScenarios`, `advise`, `buildManifest`, `importManifest`, `evaluateRules`, `HookInspection`.

## Simulator labels

Hypothesis (exact SDK base-fee arithmetic, excludes dynamic fee/price impact), SDK estimate (existing lifecycle `swapQuote2` endpoint), Verified on-chain (lifecycle snapshot). Shadow constant-product math is never used.

## Storage

Policies and rule proposals live in this browser tab's session storage only; no database tables were added.

## Status and next steps

- Tests: `src/test/hook-forge.test.ts` (31 cases). Browser smoke 1280/390.
- No devnet Token-2022 + DBC launch has been performed. Next: owner-run devnet TransferHookPool launch with a reviewed hook program, then wire the SDK path into Launch Forge behind the existing review/simulate/approve flow.