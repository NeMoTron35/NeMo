# Quantum QLi Phase 2: public Devnet activation gates

Status: **IN PROGRESS**. This is a release/evidence checklist, not evidence of successful public deployment.

## Repository parity and branch safety

- [ ] Require the **actual GitHub status checks** (CI, Security checks, CodeQL) in the active `Protect main` ruleset. GitHub ruleset currently enforces pull requests, blocks branch deletion and force-pushes, but does **not** require status checks; an administrator must configure this in GitHub settings.
- [ ] Review open PR #16 (SBF research artifact/source) and draft PR #18 (Solana canonical-genesis/signature fixes). Do not merge either without review.
- [ ] Audit Lovable project source against this repository. GitHub `main` is older and is **not** a byte-for-byte copy of current Lovable; use small, reviewable source parity PRs. Preserve frozen protocol identifiers, migrations, secrets handling, lockfile, CI, and security checks. Never publish credentials or wallet keys.
- [ ] Re-run TypeScript, Rust and compiled SBF/native CPI tests on the exact synchronized tree, including signing and negative-network cases.

## Public Devnet run (owner-controlled)

- [ ] Review the exact SBF source and CI run from PR #16. Independently verify downloaded artifact checksum and deployed code fingerprint. Never confuse a ZIP digest, file SHA256 and ProgramData fingerprint.
- [ ] From an **owner-controlled Devnet-only CLI wallet**, deploy using `scripts/deploy-transfer-hook-devnet.sh` and verify program executable/loader/ProgramData/upgrade authority with `scripts/verify-transfer-hook-devnet.sh`. Record public program ID, slot and fingerprint; do not share keypair or seed phrase.
- [ ] With owner wallet approval and faucet SOL, run public Devnet config → TransferHookPool + policy initialization → bounded `swap2WithTransferHook` trade. Confirm public signatures/slots and re-read state, including exact on-chain creator/authority and hook metas.
- [ ] Test permitted transfer; test policy rejection by **simulation** (do not describe simulated refusal as a failed on-chain transaction); test unpause/recovery. Publish `/hook-proofs` evidence with exact network, accounts, verified transaction signatures and limitations.
- [ ] Graduation: independently reproduce DBC TransferHookPool → DAMM v2 migration with required extra accounts. GitHub issue #17 remains OPEN and is **not a confirmed upstream defect**. Do not enable or claim migration until fully proven, including post-graduation allowed and denied transfers.

## Mainnet release gates

- [ ] Prove public Devnet end-to-end behavior and independently inspect public receipts.
- [ ] Obtain third-party security review of custom Token-2022 hook and remediate high-impact findings.
- [ ] Review upgrade authority, migration compatibility, emergency policy behavior and deployment provenance.
- [ ] Separately test a standard (no custom hook) mainnet DBC launch **only with explicit owner wallet approval** and real-SOL cost review; the 0.1 SOL heuristic preflight is **not** an on-chain hard spending cap.
- [ ] Custom-hook mainnet activation remains **disabled** until all gating evidence and explicit release approval exist. No unattended wallet signing/broadcast, no automatic migrations, no bypass of GitHub branch protections.

## Evidence acceptance

A green unit test, local validator result, SDK transaction builder or read-only RPC check is *not* public-chain evidence. Accept claims of public deployment, launch, swap or migration only with independently retrievable network-specific transaction signatures, account ownership/ProgramData checks, and observed slots. Document skipped tests and failed checks explicitly.

Tracking: [issue #17](https://github.com/QuantumQLi/QLi/issues/17), [PR #16](https://github.com/QuantumQLi/QLi/pull/16), [PR #18](https://github.com/QuantumQLi/QLi/pull/18).
