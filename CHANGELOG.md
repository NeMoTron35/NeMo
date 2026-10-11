# Changelog

Notable changes are recorded using [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions and semantic versioning. Entries describe code state, not proof of a published release.

## Unreleased

- Added Dual Network Test Centre (`/network-lab`, `/network-test` redirects) and central capability policy: read-only Devnet/Mainnet wallet, RPC genesis, rent and program checks with truthful readiness statuses.

## Hook Forge v2.3 owner activation — 2026-10-11

- Checksum-verified external/local SBF artifact deployment; read-only ProgramData/fingerprint/upgrade-authority verification. No automatic unknown upgrades or finalization.
- Owner-computer CLI harness: default read-only, interactive local execution, bounded debit/slippage, exact bytes/signers, simulation-before-signing, one-send confirmation and public-only incremental receipts.
- Browser activation commands, faucet and troubleshooting; migration issue #17 remains unverified and never auto-executed. No public deployment/transactions, production publish or Rust changes.

## Hook Forge v2.2 DBC transfer-hook bootstrapping — 2026-10-11

- Hook program: new `qlihk:db` init (mint keypair + wallet co-sign, open policy only) for PDA-held TransferHook authorities; `qlihk:in` unchanged. 16 unit tests; native and compiled Token-2022 CPI tests with a PDA hook authority pass locally.
- /hook-devnet steps 8–9: SDK 1.5.13 DBC ConfigWithTransferHook, TransferHookPool + qlihk:db, swap2WithTransferHook, DAMM v2 readiness/migration; all simulation-gated with exact signer/program/size checks.
- Program code fingerprint provenance; unknown code labelled UNKNOWN THIRD-PARTY and blocked for writes. Hardened build/deploy scripts with pinned Cargo.lock.
- Not deployed publicly, not audited. The old ca4bdf74 artifact is v2.1; newer PR #16 v2.2 artifact digest requires source/run verification.

## Hook Forge v2.1 Devnet Activation — 2026-10-11

- /hook-devnet console: program/mint/metas/config verification, wallet-approved mint+policy creation, pause toggles and Token-2022 transfers on devnet; refusals shown as simulation-only.
- Hook compiled to SBF (cargo-build-sbf 4.4.0, --arch v0); compiled binary passes the Token-2022 CPI scenario locally.
- scripts/build-transfer-hook-sbf.sh, owner-only scripts/deploy-transfer-hook-devnet.sh, opt-in local E2E harness.
- Not deployed publicly, not audited; DBC/DAMM hook paths remain blocked.

## Hook Forge v2 — 2026-10-11

- Research Token-2022 transfer hook (pause / receiver allowlist) in programs/quantum_transfer_hook: 12 unit tests and a BanksServer Token-2022 CPI test pass locally. Not deployed, not audited.
- /hook-proofs: devnet-only Hook Enforcement Proof with strict evidence tiers and integrity receipt.
- Hook Forge Enforcement and Graduation Proof tabs; devnet plan with signing blocked.
- Lifecycle Intelligence explicitly recognises DBC TransferHookPool instead of misreporting it.

## Hook Forge v1 — 2026-10-11

- New /hook-forge: DBC native policy templates and validator (SDK 1.5.13 parity), BigInt fee scenarios, Token-2022 TransferHook inspector via server-trusted RPC, permission/risk inspector, advisor, dry-run monitor rules, integrity-checksum manifest export/import. Read-only; custom hooks disabled; compatibility never claimed. See docs/HOOK_FORGE.md.

## Agentic Creator Studio v1

- New `/creator-studio` module: original AI personas, deterministic draft packs, 9:16 storyboard + JSON export, RPC-verified evidence cards, provenance checksums, owner-moderated Q&A and audited QLi Operator workflows. Wallet-session scoped, service-role-only tables. No hosted generation, MP4, posting or signing. See docs/CREATOR_STUDIO.md.

## [Unreleased]

### Added

- Meteora Lifecycle Intelligence v2: public read-only `/meteora-intelligence` (Graduation Sentinel, SDK `swapQuote2` exact-in quotes, fee intelligence, bounded event-CPI timeline, deterministic analysis) and `/api/public/meteora/v1/pools/{network}/{pool}` JSON API with domain-separated snapshot digest.
- Launch Proof Engine v1: public read-only `/launch-proofs` explorer, RPC-derived DBC launch verification, v1 receipt digest, Launch Forge "View Launch Proof" link and local reviewed-intent record (linkage unverified).
- Default-off wallet-session hosted consent enforced inside atomic call reservations.
- Analysis-to-Proof replay, Shadow/relationship references and fresh fee-claim review handoff; no model-authored transactions.
- Exact provider routing, fixed metadata privacy and incompatible wallet-account regression checks.

- GitHub CI, security checks, dependency updates, issue/PR templates and contributor policies.
- Repository hygiene checks, first-party browser auth and privacy-preserving local error reporting.

### Changed

- Dependency audit now matches advisory ranges against exact locked versions; high/critical advisories reduced to zero via fixed releases, a first-party `bigint-buffer` replacement and removal of unused UI/database packages.
- Shared hooks, contexts and launch-draft helpers moved out of component modules so fast refresh rules pass without warnings.

- Direct first-party Vite/TanStack/Nitro configuration and public-registry dependency resolutions.
- Repository documentation, licensing-status guidance and repeatable release checklist.

## [0.1.0] - 2026-10-10

Baseline version marker for the existing implementation; not a claim that a release was deployed.

### Added

- Classic desktop workspace with operation and public market/vault surfaces.
- Seven-stage DBC planning, reviewed signing, reference identity/proof tools and real local PQ workbench.
- First-party 27-topic help catalog and versioned 20-section technical white paper with print export.

### Known limitations

- Live launch deployment, unattended signer and deployed PQ vault verifier are not provided.
- WOTS leaf coordination and public service history are not globally durable.