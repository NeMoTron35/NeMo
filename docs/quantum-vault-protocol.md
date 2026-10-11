---
id: quantum-vault-protocol
title: Quantum Vault Protocol (Phase 1)
group: Security and protocol
summary: Unaudited Solana program for policy-limited SPL Token escrow; devnet not deployed.
---

# Quantum Vault Protocol (Phase 1)

**Status: DEVNET NOT DEPLOYED — DO NOT DEPOSIT.** Unaudited. No mainnet support. The app keeps every write disabled until a verified devnet deployment, IDL/payload hashes and account version are configured; each instruction builder also requires a fresh read-only chain attestation.

## What Phase 1 is

An Anchor program in `programs/quantum_vault` where a PDA derived from `["qvault", owner, mint, vault_id u64 LE]` owns a canonical associated token account (classic SPL Token program). Withdrawal rules are checked by the program itself, so alternate clients cannot bypass them. The pure policy core lives in `programs/quantum_vault_policy` and is shared verbatim by the program.

## Enforced on-chain

- Canonical destination ATA, its token-account owner and mint (set at creation, immutable).
- Per-withdraw maximum and a **fixed 24-hour spend window, not a sliding window** (resets when `Clock.unix_timestamp >= window_start + 86400`; validator clock drift applies).
- Optional unlock timestamp, intent expiry at most 600 s ahead.
- Sequential nonce and policy epoch; replayed or changed intents fail.
- Immediate pause; unpause only 24h after request, bumping the epoch.
- `transfer_checked` with mint decimals; zero amounts rejected; checked integer math.
- Events: VaultCreated, Deposited, Withdrawn, Paused, UnpauseRequested, Unpaused.

No admin, rescue, policy update, Token-2022, transfer hooks, native SOL or arbitrary CPI target exists. Policy is immutable in Phase 1 — to change limits, create a new vault.

## Authorization and the quantum boundary

Phase 1 is authorized by the ordinary ed25519 owner signature. It is **not** quantum-resistant custody. If the owner key is compromised, the attacker is still bound by the destination and limits, but the destination is the owner's own choice. WOTS/ML-DSA proofs from Quantum Identity and Quantum Authorization are not checked on-chain.

## Phase 2 research (not built)

On-chain PQ verification must fit 1,232-byte transactions and compute limits, likely via multi-instruction signature staging, with published test vectors. Token-2022 transfer hooks apply only to newly minted eligible tokens; the existing QLi mint cannot adopt them.

## Verification status

- Policy core: Rust unit tests (`cargo test -p quantum_vault_policy`) for unauthorized-path errors, wrong recipient, over limit, pause, expiry, nonce reuse, replay, epoch, overflow and window/time boundaries.
- Anchor program: genuine SBF compilation and real `solana-bankrun` execution passed locally. The bank executes the compiled `.so`, creates real SPL mint/ATAs, performs deposit/withdraw CPI and checks balances and rejected alternate-client operations. This is not a public devnet deployment. Standalone `solana-test-validator` was attempted but startup failed with `Discover failed`; no standalone validator transactions were run. Overflow testing includes an explicitly injected unreachable-state fixture.
- TypeScript client `src/lib/qli-core/quantum-vault.ts`: PDA derivation, account decoding, bounded intents, exact instruction guards and post-confirmation nonce checks (Vitest).

## Deployment checklist (owner action)

1. Owner supplies only the public program address and public upgrade-authority address; private keys stay with the owner. No owner-controlled signer was available in this environment, so deployment stops here. Never deploy with the generated test keypair.
2. Owner aligns `declare_id!`, Anchor configuration and client local-build address, rebuilds and reruns all checks. Use Agave 2.2.20 `cargo-build-sbf --tools-version v1.57` (Rust 1.95.0-dev); the older v1.48 compiler cannot parse edition-2024 dependencies. Anchor CLI is 0.31.1; locked Anchor crates resolve to 0.31.2. IDL generation passed using nightly-2025-11-01; `programs/idl/quantum_vault.json` is the actual generated v0.1.0 IDL for the undeployed local-build address. Its IDL-only Token-2022 helper feature does not enable Token-2022 runtime accounts.
3. Run `BPF_OUT_DIR=/absolute/artifact/path QLI_VAULT_SBF=1 bunx vitest run src/test/quantum-vault-sbf.test.ts`. Missing artifacts with this flag fail, never silently skip. Ordinary app tests skip this opt-in test. Independent audit remains outstanding.
4. Owner reviews/signs a **devnet-only program deployment** with owner-controlled program key and upgrade authority. No deposits. Retaining upgrade authority means an owner can replace program code; no-admin instructions do not make upgradeable code immutable.
5. Independently verify devnet genesis, executable upgradeable-loader ownership, canonical ProgramData PDA, upgrade authority, deployed payload SHA-256 (including allocation padding), generated IDL address/hash, account version/layout and canonical mint/escrow/destination accounts. Record public deployment transaction/evidence.
6. Keep `QUANTUM_VAULT_DEPLOYMENT=null` and the write UI disabled until those checks and a reviewed signing/confirmation workflow are complete. No automatic production publish. No mainnet.

## Pause and recovery limitations

Pause blocks withdrawals, not incoming deposits or direct SPL transfers. Only the ordinary owner signature can request/unpause after the delay; repeated requests restart the delay. Losing that signer has no recovery path. A frozen mint/account, changed destination authority or unavailable destination can block withdrawal; the owner cannot change immutable policy. There is no escrow/vault close instruction or rent-recovery path. Fixed-window boundaries can permit up to two window caps close together; this is not a rolling-24-hour cap. Quantum proofs remain application/reference proofs, never on-chain PQ verification.

## October 2026 update

Program Verifier and Vault Sentinel are read-only and never enable writes or sign. Identity 2.0 is an off-chain model only; no program verifies post-quantum proofs. See docs/QUANTUM_IDENTITY_V2.md.