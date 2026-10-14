# Mainnet SBF audit-candidate build (GitHub web UI, no Terminal)

Status: **PENDING**. The workflow `.github/workflows/qli-pq-mainnet-audit-candidate.yml` exists in
the Lovable source only. GitHub `main` is stale, so no run has happened and no build exists.

The workflow is manual, read-only (`contents: read`), uses no secrets, wallet, signer or RPC, and
never deploys or sends transactions. It refuses to build unless the Mainnet `declare_id!`,
`Anchor.toml [programs.mainnet]` and `docs/release/mainnet-release-status.json` all carry
`6P39VXXxxRHoCX7eJCKC5Tkaf4SUxdJDAeJvzykA8q7Z` and the Devnet id is unchanged. It installs Agave
v2.2.20 only after the tarball matches the SHA-256 you enter, builds with `--features mainnet`
(platform-tools v1.57) twice from clean trees, fails if checksums differ or any keypair appears,
and uploads only the `.so`, its `.sha256`, `build-manifest.json` and `AUDIT_CANDIDATE.txt`.

## Owner steps (after the source-parity PR is reviewed and merged)

1. On GitHub, review and merge the PR that brings `QuantumQLi/QLi` `main` up to the Lovable source.
   Never force-push.
2. Open github.com/anza-xyz/agave/releases/tag/v2.2.20, find
   `solana-release-x86_64-unknown-linux-gnu.tar.bz2` and copy its `sha256:` digest.
3. In the repo: **Actions → Mainnet SBF Audit Candidate → Run workflow**, paste the digest
   (without `sha256:`), branch `main`, click **Run workflow**.
4. When green, download the artifact; send the `.sha256`, `build-manifest.json`,
   `AUDIT_CANDIDATE.txt` and the commit SHA to the independent auditor for reproduction.

A green run is an audit candidate, not production approval. E9, E10, the independent audit and
the upgrade-authority decision stay pending; the Mainnet registry stays null and withdrawals off.