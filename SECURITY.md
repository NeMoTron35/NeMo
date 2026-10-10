# Security policy

## Supported versions

Only the current `0.1.x` line is maintained. Earlier snapshots have no backport commitment. This pre-production workspace is not a security-certified custody or trading product.

## Private disclosure

Use the repository's **Security → Report a vulnerability** private vulnerability reporting feature when enabled. Maintainers can enable it in repository security settings and coordinate a draft security advisory. No security email or response-time guarantee is configured. If private reporting is unavailable, contact maintainers through their existing private contact channel; if none is listed, request that private reporting be enabled without publishing exploit details or secrets. Never attach a live key or session token to an issue.

## Secret handling

- Keep credentials in deployment secret stores, not Git or populated environment files; `.env.example` contains names with empty values only.
- Only publishable browser configuration may use `VITE_`. Service-role keys and cron secrets are server-only.
- Browser auth sessions are origin-local and JavaScript-readable; prevent XSS and never forward sessions to parent frames.
- Never log/upload private keys, WOTS derivation secrets, wallet signatures used for derivation or vault backups.
- Revoke exposed credentials immediately. Removing them from the working tree does not remove historical exposure.

## Product boundaries

Quantum QLi is non-custodial. Wallet approval is explicit; reviewed messages are frozen, RPC genesis/fee payer/blockhash checked and simulation rechecked before returned signed bytes are verified. Signing is separate from submission.

ML-DSA-65, SLH-DSA-SHA2-128s and ML-KEM-768 execute locally. They do **not** make Solana account/transaction authorization post-quantum secure. Quantum Identity is a reference WOTS/Merkle construction; consumed leaves are browser-local, not globally coordinated. JavaScript cannot guarantee complete secret erasure.

Launch review is not deployment; the current launch digest does not commit to all curve, fee, social-link or first-buy inputs. Operator Autonomous mode is a scheduling preview, not a background signer. A signed-but-not-submitted identity memo is not a public confirmation. Demo holdings are not connected-wallet RPC balances. Quantum Wallet live construction fails while its verifier program id is null. Public crypto routes accept bounded public material only; history is volatile and no custodial endpoints exist.

Dependency/static checks are regression aids, not independent audits or guarantees. Maintainers must review unresolved findings before releases.
