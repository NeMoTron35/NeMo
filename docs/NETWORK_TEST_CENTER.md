# Dual Network Test Centre (`/network-lab`)

Read-only Devnet and Mainnet lanes, side by side, for later owner testing with Phantom. The page never builds, signs or sends a transaction. `/network-test` permanently redirects here. Linked from System, Launch Forge and the app navigation.

## Lane badges

Not connected · RPC unavailable (403/429/unreachable) · Wrong network (account chain or RPC genesis mismatch) · Below rent minimum · Ready to build · Confirmed by chain (only when the Launch Proof Engine verifies the pasted signature created a DBC-owned pool on the matching network; a generic confirmed signature, e.g. a SOL transfer, is shown as informational status only). "Simulation passed" and "signed" happen inside Launch Forge, never here.

Per-test statuses: Unconfigured · Can simulate · Requires owner signature · Confirmed by chain · Blocked.

## Capability policy (`src/lib/qli-core/capabilities.ts`)

| Capability                                   | Devnet                                           | Mainnet                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Wallet connect, read-only RPC                | allowed                                          | allowed                                                                                                                   |
| Standard Meteora DBC launch                  | reviewed Launch Forge flow                       | reviewed flow + 0.1 SOL preflight threshold (heuristic estimate, not an on-chain spending cap) + separate acknowledgement |
| Hook program deploy                          | owner CLI only, never in app                     | disabled                                                                                                                  |
| Hook mint/policy, DBC hook launch, hook swap | disabled until a reviewed deployment is recorded | disabled (compile-time `MAINNET_CUSTOM_HOOKS_ENABLED = false`)                                                            |
| Hook DAMM v2 migration                       | disabled (issue #17)                             | disabled                                                                                                                  |
| Quantum Vault deposit                        | disabled                                         | disabled                                                                                                                  |

## Audit findings

- Launch Forge invalidates a built review and both acknowledgements whenever form, network, RPC, wallet, account or identity changes (fingerprint), and re-checks before signing; signing re-verifies genesis, chain support, fee payer, blockhash, simulation and identical message bytes, and never submits. No gap found; no change needed.
- Wallet discovery happens after page load via Wallet Standard; account `change` events re-pick the account for the session network. The app cannot switch Phantom's network; the owner changes it in Phantom.
- Embedded preview frames cannot reach wallets: the page says to open it in its own tab. Mobile without a wallet gets a Phantom in-app-browser link.
- RPC URLs are never displayed; errors are reduced to fixed categories.

## Owner test guide (later session)

Devnet: Phantom → Settings → Developer Settings → Testnet Mode on → Solana Devnet; System → network devnet; fund at https://faucet.solana.com; Refresh; Launch Forge standard build → simulate → approve once; paste signature to confirm. Hook path: owner computer checksum-verify PR #16 artifact → `scripts/deploy-transfer-hook-devnet.sh` → `scripts/verify-transfer-hook-devnet.sh` → `/hook-devnet` steps 2–9 → `/hook-proofs`.
Mainnet (after devnet passes): Testnet Mode off; System → mainnet-beta + dedicated RPC (public RPC returned 403 to browsers); Refresh; Launch Forge standard with smallest settings; review cost/authorities; tick both acknowledgements; approve once; never retry a changed transaction; paste signature; `/launch-proofs`.

## Evidence (2026-10-11 ~22:20 UTC)

- Tests: 386 passed / 11 skipped (48 files) before final docs edit; new: `network-test.test.ts` (10), `capabilities.test.ts` (5). Lint and typecheck passed. Rust (earlier today): 16 unit + 2 Token-2022 CPI passed.
- Public read-only: devnet genesis matched and all reviewed programs executable; public mainnet RPC refused browser requests (403).
- No chain writes, signatures, deployments or launches.

## GitHub parity notice

Public `QuantumQLi/QLi` `main` is at `b5efa84` (2026-10-11 14:47 UTC, pitch-deck docs). It does not contain `src/lib/qli-core/dbc-launch.ts`, `/hook-devnet`, the v2.3 CLI or this page, so it is older than this app and is not the current source. Draft PR #16 (`035b347`) contains only the hook program files, which match this app apart from whitespace. Nothing was pushed or synced from this session.

## Known blockers

1. No reviewed devnet hook deployment (owner CLI deploy + fingerprint).
2. No funded devnet E2E (config → pool → swap) signatures.
3. Mainnet standard launch never tested; needs owner wallet, dedicated RPC and sign-off.
4. Hook DAMM v2 migration unverified (issue #17); no audit.

## Corrections (2026-10-11 ~22:35 UTC)

1. Launch proof now comes only from the Launch Proof Engine (`getLaunchProof`): DBC-owned pool/config created in the transaction, matching network/genesis. Generic signature status is informational and never changes readiness. Regression: a finalized `SystemProgram.transfer` is not a launch.
2. Lane evidence is keyed to wallet + account + System network + RPC; any change clears it, and responses that finish after a change are dropped. "Requires owner signature" and "Ready to build" need System network = lane.
3. Hook deployment is "Confirmed by chain" only after live `inspectProgram` shows executable, upgradeable loader, ProgramData fingerprint equal to the record and a reviewed QLi build, and matching upgrade authority. The record now carries `codeFingerprint` and `upgradeAuthority`; a non-null constant alone is "Blocked".
4. The 0.1 SOL figure is a heuristic preflight threshold, not an on-chain spending cap; the wallet approval is the real limit.
5. PR #16 zip contains `quantum_transfer_hook.so` and `quantum_transfer_hook.sha256`. The deploy script now uses exactly one of `<so>.sha256` or `<name>.sha256`, refuses if both or neither exist, and accepts an absolute `QLI_HOOK_SHA256` override. The checksum is never skipped. Owner-reported values: zip `835b4344…c891`, binary `91d92f85…12648`, trimmed fingerprint `81e643e4…4a89` (equals `KNOWN_HOOK_BUILDS[0]`).
6. Wallet "advertises chain" is a capability flag, not Phantom's active network; RPC genesis and the signing guard decide.

PR #16 owner command:
`QLI_HOOK_SO=/abs/dir/quantum_transfer_hook.so EXPECTED_FP=81e643e4a6d9efdabc2d2adfec2765651e49a91abfc83f991b068b4ffc434a89 bash scripts/deploy-transfer-hook-devnet.sh ~/qli-hook-program.json`

## Review correction 2 (2026-10-11 ~22:30 UTC)

- Owner launch proof additionally requires the Launch Proof Engine receipt's signing `creator` to equal the connected wallet. A verified DBC launch by someone else, or a plain confirmed transaction, never upgrades readiness; the generic check is labelled "transaction confirmation only; launch unverified" and links to `/launch-proofs`.
- Evidence key = wallet name + account + System network + lane + RPC (`evidenceKey`); `acceptCompletion` drops async results whose key changed. Unit-tested for each change; the race is not exercised in a browser test.
- A recorded hook deployment shows "Blocked / not verified" until a fresh live check passes; hook DBC steps never unlock from the record alone.
- 0.1 SOL is a rough preflight estimate threshold, not an on-chain cap; review the cost estimate and approve in the wallet yourself.