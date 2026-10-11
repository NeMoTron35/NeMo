# QuantumQLi Hook Forge v2.1 — Devnet Activation

Status: **compiled SBF binary tested locally** (Token-2022 CPI in solana-program-test). **Not deployed to public devnet, not audited.** Mainnet custom hooks stay disabled. No public transaction in this repository is claimed.

## Evidence in this release
| Check | Result | How |
| --- | --- | --- |
| Rust unit tests | 12 passed | `cargo test --features no-entrypoint` |
| Token-2022 CPI, native processor | 1 scenario passed | `programs/quantum_transfer_hook_cpi_test` |
| Token-2022 CPI, **compiled SBF binary** | 1 scenario passed (unauthorized pause 0x5108, paused 0x5100, allowlist 0x5101, direct Execute refused, missing metas fail, allowed transfers succeed) | `QLI_HOOK_SBF=1 SBF_OUT_DIR=… cargo test` |
| SBF build | OK — Agave cargo-build-sbf 4.4.0, platform-tools v1.57, `--arch v0`, 95,424 bytes | `scripts/build-transfer-hook-sbf.sh` |
| TS builders vs Rust layout | 6 tests | `src/test/hook-devnet.test.ts` |
| Full local validator E2E with browser builders | **not run here**: solana-test-validator cannot bind gossip sockets in this sandbox | `scripts/e2e-transfer-hook-localnet.ts` + `src/test/hook-devnet-localnet.test.ts` (opt-in `QLI_HOOK_LOCAL_PID`) |
| Public devnet deployment / transactions | **none** — needs the owner's wallet | `scripts/deploy-transfer-hook-devnet.sh` |

The default `--arch v3` artifact was rejected by solana-program-test 2.2 ("Unsupported program id"); v0 is used.

## /hook-devnet console (what runs with Phantom)
Devnet only (genesis checked, mainnet refused). Steps:
1. Network/wallet/balance (faucet: https://faucet.solana.com, devnet).
2. Hook program check: executable, BPF Upgradeable Loader, ProgramData upgrade authority.
3. Policy editor (pause / allowlist, 1–8).
4. **Create mint** — one transaction: Token-2022 mint with TransferHook → your program, `InitializeMint2`, `qlihk:in` (config + ExtraAccountMetaList), your token account, 1,000 test tokens. A one-time mint key is generated in tab memory, partial-signs, and is discarded; the wallet signs via the existing reviewed flow (frozen bytes, genesis, blockhash, simulation, signature preservation). Disabled until step 2 verifies an executable program.
5. Read mint / metas / config on-chain.
6. **Set policy** (`qlihk:sp`) — only when the connected wallet equals the stored authority.
7. **Transfer** — `transferChecked` with extra accounts resolved from the on-chain ExtraAccountMetaList; the resolved set must equal {hook, metas PDA, config PDA}.
Every build is simulated first. Only simulations that succeed can be signed and sent once. A refusal is shown as **simulation only** with the exact hook error and is never presented as an on-chain failed transaction. This console never sends known-to-fail transactions.

Walkthrough: create mint (paused=false) → transfer (send) → set paused=true → transfer (simulate: 0x5100) → set paused=false → transfer (send) → paste signatures into /hook-proofs.

Steps 8–9 (DBC TransferHookPool, swaps, DAMM v2) are **blocked**:
- DBC creates the base mint inside `initializeVirtualPoolWithToken2022TransferHook`; who holds that mint's TransferHook authority (needed for `qlihk:in`) is not verified.
- The allowlist checks the destination owner; DBC/DAMM vaults are PDA-owned, so allowlist mode would block swaps and migration. Only paused=false is trade-compatible; pausing also blocks swaps and migration.
- DBC acceptance (token badge) of a given hook program is not verified.
SDK 1.5.13 entry points exist (`createConfigAndPoolWithTransferHook`, `createPoolWithTransferHook`, `swap2WithTransferHook`, `migrateToDammV2`) but are not wired.

## Owner workflow
```bash
bash scripts/build-transfer-hook-sbf.sh           # builds + reruns SBF CPI test
solana config set --url https://api.devnet.solana.com
solana airdrop 2                                    # or faucet.solana.com
bash scripts/deploy-transfer-hook-devnet.sh ~/qli-hook-program.json
```
Estimated devnet SOL: ~1.4 SOL program deploy (rent, estimate), ~0.01 SOL for mint + policy + transfers. The program keypair stays on your machine; the script refuses paths inside the repo, non-devnet RPC and programs with another upgrade authority. **Upgrade authority** can replace hook code at any time; consider `--final` after review. Disabling: the mint's TransferHook authority can set the hook program to none.

Browser: desktop Chrome/Brave/Firefox + Phantom (Testnet mode on, Solana Devnet). Never paste seed phrases or private keys anywhere.

## v2.2 — Meteora DBC TransferHookPool bootstrapping (devnet only)

**Status: builders implemented and offline-tested; nothing deployed or sent on public devnet by this tool.**

### Two authorities, do not confuse them
- **Token-2022 TransferHook authority** of a DBC-created base mint = the Meteora DBC pool authority PDA (`deriveDbcPoolAuthority()`), per Meteora's own SDK test `transferHook.test.ts`. Your wallet cannot use `qlihk:in` for such a mint.
- **QLi policy authority** = your wallet, bound once by the new `qlihk:db` instruction. `qlihk:db` requires: the mint is Token-2022 with TransferHook → this program; the **mint keypair signs the same transaction** (only the pool creator holds it); the wallet signs and pays; PDAs match; config/metas are created once; the initial policy is exactly `paused=false, allowlist=false` (vault-safe). `qlihk:in` is unchanged.
- The standalone Token-2022 mint route (step 4) still makes your wallet the TransferHook authority and uses `qlihk:in`.

### Steps in /hook-devnet
| Step | What it builds | Signers | Gate |
|---|---|---|---|
| 2 | Program check + **code fingerprint** | — | executable, BPF Upgradeable Loader, fingerprint is a listed QLi build or equals your reviewed build hash; otherwise **UNKNOWN THIRD-PARTY** and all new writes are disabled |
| 8a | `partner.createConfigWithTransferHook` (Token-2022 base, SOL quote, fixed fee, DAMM v2 migration, no vesting, no first buy) | wallet + one-time config key | form validation, devnet genesis, DBC executable, exact signer set, program allowlist, ≤1232 bytes, simulation success |
| 8b | `creator.createPoolWithTransferHook` + `qlihk:db` **immediately after** the DBC init, same tx | wallet + one-time mint key | config must decode as `ConfigWithTransferHook` with `transferHookProgram` = your hook; exactly one DBC instruction (no hidden first buy) |
| 8c | read pool, then `pool.swap2WithTransferHook` buy | wallet | TransferHookPool discriminator + DBC owner, mint hook program = yours and authority = DBC PDA, QLi config + metas owned by the hook; minOut from SDK `swapQuote2`; swap ix must carry hook, metas and config |
| 9 | readiness; `migration.migrateToDammV2` | wallet + two one-time position NFT keys | quoteReserve ≥ migrationQuoteThreshold from on-chain config, not migrated, DAMM v2 config for the fee option; **SDK 1.5.13 attaches no hook extra accounts to migration**, so it is sendable only if simulation succeeds |

Every build is simulated; only successful simulations can be signed (existing `signReviewedTransaction`: frozen bytes, genesis, signer and blockhash checks) and sent once. Metadata URI is stored as text and never fetched.

### Risk
Pausing the policy refuses **every** Token-2022 transfer of the mint: curve swaps, ordinary transfers and probably DAMM v2 migration. The research hook is not audited. Mainnet custom hooks remain code-disabled.

### Build / artifact provenance
- `bash scripts/build-transfer-hook-sbf.sh` prints `file sha256` and `code fingerprint` (sha256 of the .so with trailing zeros removed — equal to what step 2 computes from ProgramData).
- Sandbox build (Agave 2.2.20, platform-tools v1.48, `--arch v0`): file sha256 `91d92f85…12648`, code fingerprint `81e643e4a6d9efdabc2d2adfec2765651e49a91abfc83f991b068b4ffc434a89`. Rebuilt twice with identical output.
- **GitHub draft PR #16's artifact (`ca4bdf74…d048`) is the OLD v2.1 program without `qlihk:db`. Do not deploy it for DBC tests;** rebuild from this commit.
- Deploy: `EXPECTED_FP=<fingerprint> bash scripts/deploy-transfer-hook-devnet.sh ~/qli-hook-program.json`. The script resolves relative/symlinked keypair paths and refuses any inside the repository; you never share the keypair.

### Owner test sequence (DBC)
1. Build, deploy (~1.4 devnet SOL rent estimate), paste program id + fingerprint into step 2.
2. 8a: enter an https metadata URI you host → build → review → sign. Config address fills in.
3. 8b: Read config (must show transferHookProgram matches) → build pool → sign. Pool and mint fill in.
4. 8c: Read pool (all checks VERIFIED) → buy 1,000,000 lamports at 100 bps → sign.
5. Step 6: pause → step 8c simulate buy (expect hook 0x5100, simulation only) → unpause.
6. Paste signatures into /hook-proofs. Graduation needs the curve to reach its threshold; then step 9.