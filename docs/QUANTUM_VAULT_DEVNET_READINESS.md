# Quantum Vault devnet readiness evidence

## Deployment: blocked at owner signing

**DEVNET NOT DEPLOYED — DO NOT DEPOSIT.** `QUANTUM_VAULT_DEPLOYMENT` remains null; UI deposit/withdraw controls remain disabled. No public-network transaction, actual deposit, mainnet vault deployment or production website publish was performed. No verifiably owner-controlled program signer/upgrade authority was available. Private keys are neither requested nor exposed. Build-tool-generated test deployment keys were deleted, not used for public deployment.

## Verified locally

- Agave 2.2.20, official SBF platform-tools v1.57 (Rust 1.95.0-dev): genuine optimized SBF build succeeded. Artifact: `/tmp/qv-artifacts/quantum_vault.so`, 256,832 bytes; SHA-256 `60b2a0bbe9207d839a4ed35805b2e7d5bc927296a8ec8b2f242361e68edc2cca`.
- Anchor CLI 0.31.1, locked Anchor crates 0.31.2, nightly-2025-11-01: genuine IDL generation succeeded. Checked-in `programs/idl/quantum_vault.json`, version 0.1.0, undeployed local-build address; SHA-256 after formatting `e32dcc477ffc940b645f85a899ed37d8d7ef2f2cdddb23bfbd907aef3f3930df`. CI compares parsed regenerated IDL, not whitespace.
- Rust policy: 8 tests passed. Host `cargo check`, Clippy and rustfmt checks passed. Anchor macro cfg/deprecation warnings remain; no warnings suppressed.
- Actual compiled SBF executed by `solana-bankrun`: real classic SPL mint/ATAs, creation, local test deposits and withdrawals, balance changes, PDA escrow authority, canonical destination, caps, fixed-window boundary, nonce replay, expiry, pause/unpause delay/epoch and negative account/CPI/signature cases. Overflow uses an explicitly injected unreachable-state fixture, not a naturally reached balance. No real assets/public deposits were used.
- App suite including SBF: **147 passed, 6 skipped, 153 total**, 25 files; bounded two-worker run passed after an earlier repository-audit timeout under higher concurrency. Skipped cases are funded/public-network integration cases, not the compiled-program test.
- ESLint and changed-file Prettier checks passed. Desktop 1280px and mobile 390px smoke: `/quantum-vault`, `/qli-agent`, `/flywheel`, `/launch`, `/authorization` returned/rendered successfully, no page errors or horizontal page overflow; both vault write controls disabled.

## Unverified or blocked checks

- Standalone Agave `solana-test-validator` attempted with the compiled program; startup ended with `Discover failed`. No standalone validator transaction test passed. Bankrun's compiled-program execution is the verified local test result.
- Full repository hygiene check failed on existing platform plan paths and neutralization matches in `drizzle.config.ts` / `bun.lock`; full formatting check flagged an existing archived plan. Changed files passed formatting. No unrelated repository files were removed to conceal failures.
- Dependency audit: zero high/critical, one moderate esbuild development-tool advisory (drizzle tooling). Not suppressed.
- Final automatic app typecheck/build results were not available in this execution; no manually rerun typecheck/build success is claimed. Prior checks are not evidence for the final edits.
- Independent audit, physical-wallet signing, funded devnet deployment and fresh deployed program/account attestation remain outstanding. CI workflow was added, not run on GitHub here.

## Security changes

Corrected the client's associated-token program address against the official SPL SDK. Pinned canonical destination ATA and stored token-account owner; rejects changed destination authority, alternate escrow/mint/program and self-destination. Owner/deposit instructions check account version and PDA seeds. Client checks exact 208-byte versioned layout, canonical accounts and classic SPL authority/state. Deployment readiness requires genesis, executable upgradeable-loader program, canonical ProgramData, public upgrade authority and program/IDL hashes, with short-lived proof bound to unchanged configuration and RPC. No signing or broadcast workflow was enabled.

The spend cap is a **fixed 24-hour window, not sliding**. Pause blocks withdrawals, not incoming SPL transfers. No policy update/admin/rescue/rent-close or lost-signer recovery exists. Retained upgrade authority can replace code. Ordinary Solana owner signatures authorize Phase 1; WOTS/ML-DSA are not verified on-chain. The QLi contract address is unchanged.

## Owner next step

Use an owner-controlled signer locally to align the public program ID, rebuild/retest and review/sign a devnet-only program deployment; never share private keys. Independently verify the resulting program, upgrade authority, IDL/version, deployed payload including padding and account ownership before configuring the client. Writes must remain disabled until the reviewed wallet approval, fresh pre-sign/pre-broadcast checks and confirmation/post-check workflow is complete. No automatic production publish.

Source HEAD observed after the verified full suite: `6b26ac88fa679968bf03eece9aafb221d726ef9d`. This evidence document was added afterward; platform-managed commits may advance the final HEAD. No manual Git commit/deployment was performed.

## Deploy & Verify panel (added)

`/quantum-vault` now includes an owner-only devnet runbook (pinned Agave 2.2.20, SBF platform-tools v1.57, Anchor 0.31.1, nightly-2025-11-01 IDL) ending at **OWNER SIGNATURE REQUIRED**, and a read-only Program Verifier (`src/lib/qli-core/vault-verifier.ts`) that checks devnet genesis, executable upgradeable-loader program, canonical ProgramData, upgrade authority vs your expected key, artifact-prefix SHA-256 plus zero padding (distinct from a whole-ProgramData hash), and IDL address/name/version. A pass never enables writes (`writesEnabled: false`); config must be committed to source after owner review. Rebuilding after `anchor keys sync` changes the artifact hash — re-attest your own bytes. Later, move upgrade authority to a multisig with `solana program set-upgrade-authority`.

## Corrected owner runbook (repository-root, devnet only)

The in-app runbook (`DEPLOY_RUNBOOK` in `src/lib/qli-core/vault-verifier.ts`) is the source of truth; summary:

1. Pin Agave 2.2.20, SBF platform-tools v1.57, Anchor CLI 0.31.1, nightly-2025-11-01 (IDL only).
2. `cd` to the clone, `export QLI_ROOT="$(pwd)"`, `mkdir -p programs/target/deploy`. Every later step uses `$QLI_ROOT/...` paths or a `( cd "$QLI_ROOT/programs" && ... )` subshell, so the shell always stays at the root.
3. `solana config set --url https://api.devnet.solana.com`; `solana genesis-hash` must print `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`.
4. **Owner wallet** (fee payer + upgrade authority) at `~/.config/qli-devnet/owner.json`, mode 600. **Program-id keypair** at `programs/target/deploy/quantum_vault-keypair.json` (git-ignored), a separate file that only fixes the address. Both are private keys: keep offline, back up safely, never paste, upload or commit.
5. `anchor keys sync` updates `declare_id!` and `programs/Anchor.toml`. Edit `LOCAL_BUILD_PROGRAM_ID` in `src/lib/qli-core/quantum-vault.ts` by hand (tests import it). `grep` checks confirm all three match `$PROGRAM_ID` and the old placeholder `93v9K8yt…7SH5` no longer appears.
6. Rebuild SBF and IDL; record the **new** `sha256sum` and byte length. The placeholder-build hash `60b2a0bb…2cca` is only valid for the placeholder id and is never used as a default.
7. From the root: `cargo test -p quantum_vault_policy` (in `programs`) and `QLI_VAULT_SBF=1 BPF_OUT_DIR="$QLI_ROOT/programs/target/deploy" bunx vitest run src/test/quantum-vault-sbf.test.ts src/test/quantum-vault.test.ts`.
8. **OWNER SIGNATURE REQUIRED:** `solana program deploy … --program-id <program keypair> --upgrade-authority <owner.json> --keypair <owner.json> --url devnet`.
9. `solana program show` (authority must equal your wallet), `solana program dump`, then hash the first `LEN` bytes and confirm the rest is zero padding.
10. Share only the public program address and public upgrade authority. Commit `OWNER_REVIEWED_ARTIFACT` and `QUANTUM_VAULT_DEPLOYMENT` for source review. Until then the Program Verifier shows the bytecode check as NOT CHECKED, never ok, and does not accept pasted hashes. Writes stay disabled.
