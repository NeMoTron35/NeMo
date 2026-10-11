---
id: quantum-vault-protocol
title: Quantum Vault Protocol (Phase 1)
group: Security and protocol
summary: Unaudited Solana program for policy-limited SPL Token escrow; devnet not deployed.
---

# Quantum Vault Protocol (Phase 1)

**Status: DEVNET NOT DEPLOYED — DO NOT DEPOSIT.** Unaudited. No mainnet support. The app keeps every write disabled until a verified deployment and account version are configured.

## What Phase 1 is

An Anchor program in `programs/quantum_vault` where a PDA derived from `["qvault", owner, mint, vault_id u64 LE]` owns a canonical associated token account (classic SPL Token program). Withdrawal rules are checked by the program itself, so alternate clients cannot bypass them. The pure policy core lives in `programs/quantum_vault_policy` and is shared verbatim by the program.

## Enforced on-chain

- Fixed destination token account and mint (set at creation, immutable).
- Per-withdraw maximum and a 24h spend window (resets when `Clock.unix_timestamp >= window_start + 86400`; validator clock drift applies).
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
- Anchor program: source only. On-chain enforcement is **unverified** until compiled with `anchor build` and exercised on a local validator.
- TypeScript client `src/lib/qli-core/quantum-vault.ts`: PDA derivation, account decoding, bounded intents, exact instruction guards and post-confirmation nonce checks (Vitest).

## Deployment checklist (owner action)

1. Install Solana CLI + Anchor 0.31; `cd programs && anchor keys sync && anchor build`.
2. Add `solana-program-test`/Anchor integration tests for every negative case; run on a local validator.
3. Independent audit.
4. Deploy to devnet with your own keypair; disclose the upgrade authority (or make it immutable).
5. Set `QUANTUM_VAULT_DEPLOYMENT` with the verified program id and account version. Only then do writes enable, devnet only.