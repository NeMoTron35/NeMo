# Hook Forge v2.3 validation report

## Implemented

- `scripts/hook-artifact.py`: actual ELF/checksum parsing, trusted public-devnet genesis, executable/loader/ProgramData and upgrade-authority verification, distinction between file checksum and deployed code fingerprint. Read-only account probe distinguishes absent deployment from RPC failures.
- `scripts/verify-transfer-hook-devnet.sh`: public read-only owner verification.
- `scripts/deploy-transfer-hook-devnet.sh`: owner-only interactive deploy, canonical outside-repository program keypair, reviewed checksum, previous code/authority gate, rent estimate, post-deploy verification and `solana program show`. No automatic unknown upgrades, dependency install, finalization or agent execution.
- `scripts/build-transfer-hook-sbf.sh`: matching checksum sidecar. Rust source unchanged.
- `scripts/hook-e2e-core.ts`, `scripts/e2e-hook-dbc-devnet.ts`, `scripts/e2e-hook-dbc-devnet.sh`: real SDK 1.5.13 config/pool/swap builders, default read-only simulation, locally approved execution, exact signers/frozen bytes/blockhash, no repeated send, bounded debit/slippage, confirmation and identical on-chain message checks, incremental public-only receipts. Isolated Node runtime avoids browser declaration aliases.
- `src/components/qli-core/hook-devnet.tsx`: artifact/deploy command copy, owner walkthrough, faucet and troubleshooting; existing steps 8/9 retained. New writes remain blocked without reviewed deployed code.
- `src/lib/qli-core/hook-devnet.ts`: stronger ProgramData owner/canonical address/header checks.
- `src/lib/qli-core/hook-dbc-devnet.ts`: fail-closed SDK nullable-account handling.
- Regression tests: `src/test/hook-e2e.test.ts`, `src/test/hook-artifact.test.ts`, `src/test/hook-dbc-devnet.test.ts`.
- Documentation: README, CHANGELOG, roadmap, AGENTS, HOOK_FORGE_DEVNET and HOOK_FORGE_V2. Formatting-only changes in styles.css; generated Rust output excluded from formatter/linter.

## Executed results

| Check                                              | Actual result                                                                                                                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full `bun run test`                                | **371 passed, 11 skipped, 0 failed**; 42 test files passed, 4 skipped                                                                                                                                    |
| `bun run format:check`                             | Passed                                                                                                                                                                                                   |
| `bun run lint`                                     | Passed                                                                                                                                                                                                   |
| Typecheck and production build                     | Automatic Lovable validation reported **build OK** after fixing an invalid `isBlockhashValid` SDK argument; not manually rerun because the environment forbids manual project builds/typechecks          |
| Rust unit                                          | **16 passed**, no failures                                                                                                                                                                               |
| Actual Token-2022 BanksServer native-processor CPI | **2 passed**, no failures                                                                                                                                                                                |
| Fresh SBF build                                    | **BLOCKED**: `error: no such command: build-sbf`; cargo 1.91.0 available, `cargo-build-sbf`/Solana CLI absent                                                                                            |
| Fresh compiled SBF CPI                             | **NOT RUN**: no compiled artifact available; prior v2.2 results are historical                                                                                                                           |
| CLI wrapper `--help`                               | Passed with Bun 1.3.3 and Node 22.22.0                                                                                                                                                                   |
| Shell syntax                                       | All four owner/build/verify/E2E scripts passed                                                                                                                                                           |
| Public RPC (read-only)                             | Actual genesis matched `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`; System Program correctly refused as non-Upgradeable hook code                                                                     |
| Browser 1280 and 390                               | Copied deployment command, opened troubleshooting, checked real non-hook program; no page errors or horizontal overflow; wallet missing and unknown-code status shown; all seven build controls disabled |

Connected Phantom, funded owner wallet, real QLi deployment, CLI execution and complete public config/pool/swap were **not exercised**. No fabricated signatures, private key access, public deployment, chain write, GitHub push or production publish occurred. Opt-in live deployment test skipped because no owner program/fingerprint was supplied. Local mocked SDK/RPC tests do not establish public Meteora acceptance.

## Last owner steps

1. Review the v2.2 source/CI run in PR #16 and download its new unsigned artifact plus matching checksum; latest artifact completion/digest are unverified here. Never reuse old v2.1 `ca4bdf74…d048` for DBC initialization.
2. On your own computer, configure a devnet-only Solana CLI payer and obtain faucet SOL. Run the checksum-verified deployment command shown in `/hook-devnet`; type `DEVNET` only after reviewing the program ID, estimated cost and fingerprint. Keep keypairs outside the repository.
3. Run the public verifier. Paste the program ID/fingerprint into `/hook-devnet` step 2. With Phantom on Devnet, run 8a config → 8b pool/policy → 8c tiny reviewed buy; or use the owner CLI commands in [the runbook](HOOK_FORGE_DEVNET.md), approving each `SEND` separately.
4. Optional pause test is dangerous: it blocks transfers and liquidity. Denial is simulation-only, never sent. Explicitly approve unpause; interruptions require deliberate owner recovery.
5. Review/export real confirmed receipts and enter signatures in `/hook-proofs`, which independently re-reads public evidence. Receipt checksums are not signatures or audits.

Dry-run stops after the first simulated dependent account-creation transaction; later stages require confirmed config/pool addresses. No default spending, secret persistence or automatic retry exists. Ambiguous sends must be reconciled before rebuilding because ephemeral mint/config keys cannot be recovered.

## Remaining blockers

Owner-reviewed artifact, owner devnet deployment/funding and explicit approvals are still required. No independent audit. Migration compatibility remains unresolved in [issue #17](https://github.com/QuantumQLi/QLi/issues/17); readiness does not prove graduation, no CLI migration is performed, and post-grad proof requires linked real transactions. Never disable the hook to manufacture success. Mainnet custom hooks remain disabled.

Preview: https://id-preview--165e3830-c616-4f8f-8970-b84a328f3639.lovable.app/hook-devnet

## Phase 2 readiness audit — 2026-10-11 21:50 UTC

| Check                                          | Result                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public devnet genesis (read-only RPC)          | `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` — matches `DEVNET_GENESIS`                                                                                                             |
| Reviewed deployment (`HOOK_DEVNET_DEPLOYMENT`) | `null` — no reviewed program ID exists, so there was nothing to inspect on devnet                                                                                                     |
| PR #16 head `035b347`                          | Open draft; CI, CodeQL, Rust unit and SBF compile jobs succeeded                                                                                                                      |
| PR #16 artifact                                | `quantum-transfer-hook-research-sbf`, 44,610 bytes zip, GitHub digest `sha256:835b4344…c891` (zip digest, not the `.so` fingerprint); downloading it needs a signed-in GitHub account |
| Source parity PR #16 vs Lovable                | `lib.rs`, `tests.rs`, CPI test and `Cargo.toml` match except whitespace (v2.2 `qlihk:db` present). The build script differs only by the `.sha256` sidecar line                        |
| App tests                                      | 371 passed, 11 skipped (42 files)                                                                                                                                                     |
| Rust unit tests                                | 16 passed                                                                                                                                                                             |
| Native Token-2022 CPI                          | 2 passed (`enforces_policy`, `dbc_mint_signer_bootstrap`; 0x5100 denial observed)                                                                                                     |
| Fresh SBF build here                           | BLOCKED — `cargo-build-sbf`/`solana` not installed                                                                                                                                    |
| Deployments, signatures, funded transactions   | None. Nothing was deployed, signed or broadcast                                                                                                                                       |

### Shortest safe owner sequence

1. Download the PR #16 artifact on your own computer, unzip it, and run `sha256sum -c quantum_transfer_hook.so.sha256`.
2. Deploy with `bash scripts/deploy-transfer-hook-devnet.sh` (your local keypair, devnet only).
3. Verify: `bash scripts/verify-transfer-hook-devnet.sh PROGRAM_ID FINGERPRINT YOUR_WALLET`.
4. Dry run: `bash scripts/e2e-hook-dbc-devnet.sh --dry-run --program PROGRAM_ID --fingerprint FINGERPRINT --wallet YOUR_WALLET --uri https://YOUR_METADATA_JSON`.
5. Run it for real only with `--execute --ack-devnet --pause-test --output /abs/receipt.json`, typing `SEND <kind>` for each transaction.
6. Share only the public program ID, fingerprint and receipt JSON, so `/hook-proofs` can check them and the deployment record can be filled in.