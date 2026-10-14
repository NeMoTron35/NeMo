# QuantumQLi Hook Forge v2 — On-Chain Enforcement and Graduation Verification

Status (this release): research hook **LOCAL_VALIDATOR_TESTED**. Not deployed, not audited, no public devnet demonstration. No mainnet custom-hook path exists.

v2.3 adds owner-only checksum-verified artifact deployment and a default read-only, interactively approved local E2E CLI. See [activation runbook](HOOK_FORGE_DEVNET.md). No deployment/simulation/receipt can substitute for linked server-verified public evidence; migration forwarding remains unverified in issue #17.

## What a transfer hook is (and is not)

- Token-2022 invokes the mint's hook program through the Transfer Hook Interface `Execute` instruction on every **token transfer**, resolving extra accounts from the `extra-account-metas` PDA and passing de-escalated (read-only, non-signer) accounts. During that CPI the source token account's `TransferHookAccount.transferring` flag is true.
- It is **not** a swap callback. It does not see DBC prices, does not block arbitrary DBC logic, and does not guarantee DAMM v2 compatibility. A pause or allowlist only applies while Token-2022 transfers that mint and the hook program is active.
- References: https://solana.com/docs/tokens/extensions/transfer-hook , https://spl.solana.com/transfer-hook-interface , Meteora DBC docs (https://docs.meteora.ag) and the pinned SDK `@meteora-ag/dynamic-bonding-curve-sdk@1.5.13` IDL (`createConfigWithTransferHook`, `initializeVirtualPoolWithToken2022TransferHook`, `swap2WithTransferHook`, `migrationDammV2`).

## A. Research hook program — `programs/quantum_transfer_hook`

Standalone crate (own workspace, excluded from the vault workspace). Pins: `solana-program 2.2`, `spl-transfer-hook-interface 0.10`, `spl-tlv-account-resolution 0.10`.

| Instruction           | Accounts                                                                                  | Rule                                                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qlihk:in` init       | authority (signer), config PDA `["qli-hook-config", mint]`, mint, extra-metas PDA, System | Mint must be Token-2022 with TransferHook extension pointing at this program and signer equal to the extension authority. Creates config + ExtraAccountMetaList (one extra account: config PDA).                                 |
| `qlihk:sp` set policy | authority (signer), config, mint                                                          | Only the stored authority. Paused flag, allowlist mode, 1–8 unique receiver owners.                                                                                                                                              |
| Interface `Execute`   | source, mint, destination, owner, extra-metas, config                                     | Refuses unless source/destination are Token-2022 accounts of this mint, `transferring == true`, PDAs/owners match; then paused → error `0x5100`, receiver not allowlisted → `0x5101`. Direct call outside a transfer → `0x5102`. |

No fund movement, delegates, fees, counters or external CPI (only System Program for PDA creation). An allowlist cannot be empty and the authority can always unpause. **Owner privileges:** the authority can pause all transfers (including swaps and migration that move the mint) at will. **Turning it off:** the mint's TransferHook authority can set the hook program to none via Token-2022 (`spl-token --program-2022 set-transfer-hook <MINT> --disable`), after which no policy applies. **Upgrade risk:** if deployed with an upgrade authority, the code can change after inspection; Hook Proofs reports this.

The test id `QLiHook111…` in tests is a local placeholder, not a deployed address. No keypair is stored in the repository.

## Evidence tiers

| Tier                    | Granted by                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NOT_CONFIGURED          | default                                                                                                                                                                                                                                                                                                                                 |
| LOCAL_UNIT_TESTED       | `cargo test --features no-entrypoint` (12 tests) — PASSED                                                                                                                                                                                                                                                                               |
| LOCAL_VALIDATOR_TESTED  | `programs/quantum_transfer_hook_cpi_test` — PASSED: solana-program-test BanksServer, bundled Token-2022, real `transfer_checked` CPI into the hook (allowed, unauthorized pause refused, paused refused, allowlist deny/allow, direct Execute refused, missing extra accounts fail). Hook ran as a native processor, not an SBF binary. |
| DEVNET_PROGRAM_DEPLOYED | Hook Proofs: hook executable, Token-2022 mint bound to it, ExtraAccountMetaList owned by hook                                                                                                                                                                                                                                           |
| DBC_VERIFIED            | + DBC-owned **TransferHookPool** (discriminator, not VirtualPool) with this base mint, a successful `swap2WithTransferHook` binding pool (account 2) and mint (account 7) with the hook invoked, and a pre-graduation allowed transfer plus a hook-attributed denied transfer                                                           |
| MIGRATION_VERIFIED      | + confirmed `migrationDammV2` binding virtual pool (0), DAMM v2 pool (4) and base mint (13), DAMM v2 pool owned by `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`, pool flag migrated. Flag alone never suffices.                                                                                                                        |
| POST_GRAD_VERIFIED      | + allowed and hook-attributed denied transfers at slots after migration                                                                                                                                                                                                                                                                 |

A failed transaction counts as a hook denial only if logs show `Program <hook> failed`. Receipt: SHA-256 over canonical JSON with domain `QuantumQLi.HookProof.Receipt.v2` — integrity checksum only, not a signature, attestation or audit.

## B. Devnet builder status

`src/lib/qli-core/hook-launch-plan.ts` provides deterministic account planning (extra-metas PDA, policy PDA) and the ordered runbook. **Signing is blocked** (`HOOK_DEVNET_DEPLOYMENT = null`): no deployed reviewed program, no audit, no funded E2E, DBC acceptance of a given hook program unverified. The existing SPL Launch Forge path is unchanged. Mainnet custom hooks are code-disabled.

## C. Hook Proofs — `/hook-proofs`

Server function `verifyHookEnforcement` (devnet only, server-trusted RPC allowlist, genesis check, ≤6 accounts, ≤8 transactions, per-client rate limit). Decodes with the SDK 1.5.13 coder.

## D. Lifecycle adapters

DBC accounts are classified by discriminator (`dbcAccountKind`). Lifecycle Intelligence v2 now returns an explicit `transfer-hook-pool` result for TransferHookPool instead of "not a VirtualPool", and points to Hook Proofs. Launch Proofs v1 continue to verify SPL launches only.

## Owner devnet runbook (owner-run; never share keys)

```bash
# repo root
cd programs/quantum_transfer_hook
solana config set --url https://api.devnet.solana.com
solana-keygen new -o ~/qli-hook-program.json   # program id keypair, keep offline
# replace the declared id usage if adding declare_id!, then:
cargo build-sbf
solana program deploy target/deploy/quantum_transfer_hook.so --program-id ~/qli-hook-program.json --url devnet
HOOK=$(solana-keygen pubkey ~/qli-hook-program.json)
spl-token --program-2022 create-token --transfer-hook $HOOK --url devnet
# init policy + extra metas with instruction prefix "qlihk:in" (see lib.rs), signer = mint hook authority
# DBC: SDK createConfigAndPoolWithTransferHook -> swap2WithTransferHook -> migrateToDammV2
# Then paste mint, hook, pool, DAMM v2 pool and signatures into /hook-proofs.
```

Each step needs your own funded devnet wallet. QuantumQLi never requests, stores or exports keys and has not run these steps.

## Sample proof request

```json
{
  "network": "devnet",
  "mint": "<mint>",
  "hookProgram": "<hook>",
  "dbcPool": "<TransferHookPool>",
  "dammPool": "<DAMM v2 pool>",
  "txs": [
    { "signature": "<sig>", "claim": "transfer-allow" },
    { "signature": "<sig>", "claim": "transfer-deny" },
    { "signature": "<sig>", "claim": "dbc-swap" },
    { "signature": "<sig>", "claim": "migration" }
  ]
}
```

## Tests

- Rust: `QLI_RUN_RUST_HOOK_TESTS=1 bun run test:transfer-hook` (16 unit + 2 BanksServer CPI scenarios). v2.3 reran native processor CPI; SBF compilation and compiled CPI are blocked in this environment because `cargo-build-sbf` and the compiled artifact are absent. Prior v2.2 compiled results are historical, not fresh v2.3 evidence.
- TypeScript: `src/test/hook-proof.test.ts` (tiers, fake/unrelated txs, wrong genesis, mainnet refusal, spoofed owners, VirtualPool vs TransferHookPool, IDL account positions, lifecycle rejection, signing gate).

## Remaining blockers

Owner devnet deploy (SBF build now passes, see HOOK_FORGE_DEVNET.md), owner-funded devnet E2E, DBC acceptance of the hook program, independent audit.
