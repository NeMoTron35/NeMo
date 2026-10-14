# On-chain launch deployment checklist

## Implemented

- Wallet Standard discovery with asynchronous registration; accounts accepted when the chain is listed on the account or the wallet.
- Visible diagnostics: embedded frame, mobile browser without wallet (Open in Phantom link), desktop without extension; explicit rejection messages.
- Network switch moves the default RPC between mainnet and devnet.
- Real `createConfigAndPool` build, review, wallet signature, single submission, confirmation and owner checks.
- Duplicate-submission guard; separate submitted / confirmed / failed / expired states.
- Mainnet gated (no unconditional lock): full genesis hash, program allowlist, exact signer set, pre-wallet simulation, 0.1 SOL preflight threshold (simulated wallet balance change plus fee, or the rough estimate if the RPC reports no balances — not an on-chain cap), separate mainnet acknowledgment showing authorities, mint, config, pool and metadata URL.
- Recovery: "Check status" rebroadcasts the identical signed bytes (same signature) until blockhash expiry and re-verifies DBC ownership.
- Fixed: genesis constants were truncated to 32 characters, which would have refused every public-network launch.
- Signing uses the same chain rule as connection (account chains, or wallet chains when the account lists none).
- Reviewed transactions are discarded on any change to form, mode, seal data, network, RPC, wallet or identity; a fingerprint is rechecked right before signing; acknowledgment resets on every build; sent signatures are kept for recovery.
- Quantum Launch verifies the WOTS/Merkle seal proof against the canonical launch data and the open identity; refuses public-demo seals.
- Cost shown is a rough heuristic, not a bound.

- After wallet approval every required signature (payer, config, mint) must be present and valid, and the pre-signed config/mint signatures must be returned unchanged; otherwise the bytes are discarded before sending.
- After confirmation the config, pool and Metaplex metadata accounts are re-read: fee claimer, leftover receiver and creator must be the wallet and the token authority option Immutable; metadata update authority and mutability are displayed as read from chain.
- Event Log records confirmed launches as on-chain events (network, signature, pool); other events keep the local simulation label.
- HTTP 403/429 errors explain the need for a dedicated RPC without echoing the RPC URL.

## Test results

- Local validator with the DBC and Metaplex programs cloned from devnet: config + pool created, submitted and confirmed; pool owned by the DBC program; about 0.033 SOL spent.
- Same environment: unfunded wallet refused, devnet mismatch refused, mock wallet rejection and tampered bytes refused, stale blockhash refused.
- Public mainnet and devnet RPC dry run (empty throwaway address, nothing signed or sent): genesis, program, quote mint, SDK transaction, signer set and program allowlist all pass; stops at the funding check as expected. Run: `QLI_PUBLIC_RPC=1 bunx vitest run src/test/public-rpc-dry-run.test.ts`.
- Run: `QLI_LOCAL_RPC=http://127.0.0.1:8899 bunx vitest run src/test/dbc-launch.test.ts`.

## Not yet verified

- Physical Phantom extension or Phantom mobile browser: untested (no wallet extension in the build environment).
- Public devnet funded launch: untested (faucet returned 429 rate limit on Oct 10 2026).
- Mainnet funded launch: never submitted; requires the user's own Phantom approval.

## Blocked / not implemented

- First buy, fee schedulers, vesting, Token-2022, vanity mints, non-SOL quotes.
- Seal coverage: the v1 launch digest does not cover curve, fees or liquidity.
- Metadata upload: the user supplies a hosted JSON URI; no IPFS/Arweave upload is integrated, so Quantum Launch attestations on mutable hosts are labeled not immutable.

## Launch Proof Engine v1

- [x] Public read-only proof explorer at `/launch-proofs`; Launch Forge shows "View Launch Proof" after a confirmed launch. See `docs/LAUNCH_PROOF_ENGINE.md`.
- [x] Read-only check against real devnet RPC with a third-party DBC pool creation.
- [ ] Funded devnet launch from Launch Forge (owner action, own wallet):
  1. In System, select devnet. Fund the wallet with devnet SOL from a faucet.
  2. In Launch Forge, fill the Standard launch, host the metadata JSON, and Build transaction.
  3. Review accounts and cost, tick the acknowledgment, and approve in Phantom.
  4. After "Confirmed", open "View Launch Proof". The page must show "Verified Meteora DBC launch" read from RPC. Until then this item is not verified.

## QLi Agent v2

- [ ] Publish so `/api/public/qli-agent/worker` is served on the production domain.
- [ ] Confirm the 5-minute scheduled job is active and a worker run shows `ok` within 15 minutes.
- [ ] Optional: set `QLI_AGENT_RPC_MAINNET` / `QLI_AGENT_RPC_DEVNET` to an allowlisted HTTPS RPC.
- [ ] Test sign-in, pool registration and a proposal handoff with a real wallet on devnet.

## Quantum Vault

Follow the deployment checklist in `docs/quantum-vault-protocol.md`. Compiled SBF local bank tests now exist; do not configure or enable writes without owner-signed devnet deployment, independent audit/review, matching IDL/program payload hashes and fresh chain/account checks. No deposits or automatic production publish.
