# Quantum QLi contributor architecture guidance

Read CONTRIBUTING.md and SECURITY.md before changing operation or auth boundaries.

## Architecture

- Use file-based TanStack content routes within one shared console shell and session provider so navigation preserves operation previews.
- Keep typed demo repositories separate from DBC transaction adapters; fabricated addresses must never enter live signing flows.
- Initialize the Meteora client inside invoked service factories; browser wallet-standard access and crypto run only after hydration or user interaction.
- Keep settings and strategy repositories inside the console provider, session-only and isolated per SSR request; production persistence requires a secured metadata repository excluding cryptographic secrets.
- Verification uses an explicitly isolated public-demo WOTS encoding, with frozen first-party v1 domain strings and no third-party protocol compatibility claims, so demonstration proofs cannot be misrepresented.

- Signing freezes the reviewed message, checks genesis, payer, blockhash and signers, simulates, rejects altered bytes; the launch panel alone submits once, confirms, checks DBC ownership; mainnet stays code-locked until a real-wallet devnet launch.
- Operational routes share the desktop shell; the public hackathon pitch bypasses wallet providers and uses isolated presentation styling so reading slides cannot initiate RPC or wallet work.
- Public-parity `qli` modules share the console context and wallet-review boundary; demo market records must never enter signing adapters.
- Browser ML-DSA vault keys live only in the request-isolated provider's tab memory and are wiped on clear/unmount; offline backup is explicit, never persisted or uploaded.
- Public crypto endpoints under `/api/public/v1/*` accept bounded public material only and dynamically load crypto handlers; no custodial signing or private-key endpoint exists.
- Resolve Buffer, rpc-websockets and Anchor to browser implementations; stubs or Node entries break startup.
- Keep operations under `qli-core`, distinct from public-parity `qli`; this prevents collisions while preserving shared providers.
- Freeze v1 domains, wire kinds, public-demo derivation input and ledger/message prefixes in `src/lib/qli-core/compatibility.ts`; pre-refactor byte vectors prevent namespace cleanup from invalidating proofs or consumed leaves.
- Hash-signature primitives live in pq.ts, identity derivation/ledger/memo in identity.ts, vault modeling in quantum-wallet.ts; the leaf ledger persists only consumed indexes so secrets never touch storage.
- The Quantum Wallet adapter refuses live construction while its program id is null, so no third-party program can be silently used.
- Theme public and retained operational surfaces through shared semantic CSS and dialog slots so presentation changes do not alter signing or proof logic.
- Render hero artwork visibly in server HTML with explicit image/shade/content stacking; never gate visibility on hydration or load events, so startup failures cannot hide it.
- Keep movable window state frontend-only, bounded and keyboard-adjustable; collapse overlays to document flow on smaller screens so windows cannot strand controls or obscure mobile forms.
- Utility console output uses public session statuses and reviewed-plan titles only, never raw RPC URLs, identity secret material or backup keys, to preserve noncustodial privacy.
- Keep first-party documentation bodies in docs/*.md and bundle the same sources into the help reader; stable article search parameters and section hashes preserve shareable help links without duplicated content.
- Keep the versioned white paper in docs/whitepaper/index.md, separate from the 28-article catalog; the reader bundles one source and prints all sections to prevent export/content divergence.
- Preserve first-party build plugins, custom server entry and browser aliases; production has no external module resolution.
- Use the first-party lazy browser auth client and session-header middleware; sessions must stay on the app origin and must never be forwarded to ancestor frames.
- Keep lowercase front-matter articles in the help catalog and uppercase repository policies outside it; this prevents repository prose from breaking the 28-article reader.
- Emit allowlisted local error categories, never thrown payloads, stacks or raw URLs; this avoids exposing secret-bearing error data.
- Run frozen-lock install, formatting, lint, type validation, tests, production build and repository hygiene checks in CI; release checks must fail, never conceal gaps.
- Replace unmaintained vulnerable transitive packages with reviewed first-party workspace packages under `packages/` wired through `overrides`; never suppress or filter audit findings, so the audit stays truthful.
- Separate hooks/contexts from providers for reliable fast refresh.
- Atomic model budgets require owner consent; hash-only analysis handoffs re-read on-chain and never authorize funds.

- Script-specific safety rules: see `scripts/AGENTS.md`.
