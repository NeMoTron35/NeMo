# QLi dual-network wallet readiness and test gates (2026-10-11)

## Scope and release boundaries
The connected Lovable app and this GitHub default branch are **not identical**. This GitHub branch contains a focused wallet verification fix only; it does not deploy the current Lovable application or the Hook Forge v2.3 feature set.

- **Devnet:** prepare a Phantom-controlled account, switch the wallet's selected network to Solana Devnet manually if supported, obtain free faucet SOL, and require a verified devnet genesis before building/simulating/sending any transaction.
- **Mainnet:** use the owner's Phantom account, require the canonical mainnet genesis, reviewed message and exact payer/signatures. All transactions can spend real SOL. Keep custom Token-2022 Hook Forge **disabled** on mainnet; do not infer safety from simulator or local tests.
- **Never** ask testers to share seed phrases, private keys, raw keypair JSON, or install a purported 'verification' wallet. Never auto-sign or auto-send.

## Phase A: cross-network wallet and RPC smoke (no chain writes)
1. Test desktop Phantom extension and Phantom mobile in-app browser, each with connection, disconnect, account changed, rejection and recovery.
2. Check correct displayed address and accepted Wallet Standard chains. A wallet/RPC network mismatch must block signing.
3. Verify exact RPC genesis hashes: Devnet `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`; Mainnet-beta `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`.
4. Test intermittent/403/429 RPC responses and stale blockhash; fail closed with no false 'confirmed' status.
5. Rebuild/review if network, RPC, wallet account, instructions or fee payer change. Verify all returned signer signatures.
6. No funds should move in this smoke test.

## Phase B: devnet test with owner approval
1. Obtain an owner-reviewed compiled SBF artifact from draft PR #16, independently verify the artifact checksum and code identity, and review program upgrade authority. A successful CI check is not a chain deployment.
2. Deploy using an owner-controlled local signer on public devnet; disclose the public program ID, expected binary fingerprint and authority.
3. Verify on-chain executable and ProgramData accounts, genesis and fingerprint independently.
4. Simulate and then authorize small real transactions individually: Token-2022 config/mint, permitted transfer, policy update to paused, rejected transfer **simulation only**, unpause, permitted transfer.
5. Test supported Meteora DBC config, pool creation and smallest practical buy with exact SDK/version accounts, then collect confirmed signatures, slot and read-back proof. Graduation/migration remains unresolved under issue #17.
6. Never claim hook enforcement on public devnet until the full confirmed evidence exists. No synthetic transactions, invented signatures or prefunded agent keypairs.

## Phase C: mainnet wallet and standard-launch test
1. Verify the owner's real mainnet RPC and Phantom account with no signing; show balance and estimated costs. Warn that real SOL is involved.
2. First complete the corresponding funded devnet standard DBC launch.
3. Only after owner review, use the **standard** Meteora DBC token pathway, never unaudited custom TransferHook or research contract. Review full message bytes, authorities, token mint, metadata URL, fee/rent cost, slippage where applicable and exact signer set.
4. Explicitly approve each individual transaction in Phantom. No hidden retries, no automatic purchases, no automatic mainnet migration.
5. Verify confirmed signature and read-back chain accounts and preserve public proof. A UI 'success' badge alone does not satisfy acceptance.

## Acceptance criteria
- [ ] Physical Phantom verified on both target networks
- [ ] Public funded devnet standard DBC launch signature validated
- [ ] Public devnet hook executable + ProgramData fingerprint validated
- [ ] Public devnet permitted/denied hook and DBC workflows validated
- [ ] Safe owner-approved mainnet standard DBC launch, if desired
- [ ] Hook graduation compatibility independently verified (issue #17)
- [ ] Independent security review before enabling mainnet custom hooks

**Current status:** The automated Rust/Token-2022 CPI and TypeScript tests described in Lovable's v2.3 report are code-level evidence, not proof of any QLi public deployment. This GitHub pull request is a **review gate**, not a mainnet feature launch.
