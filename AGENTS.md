# Quantum QLi contributor architecture guidance

Read CONTRIBUTING.md and SECURITY.md before changing operation or auth boundaries.

## Architecture

- Use file-based TanStack content routes within one shared console shell and session provider so navigation preserves operation previews.
- Keep typed demo repositories separate from DBC transaction adapters; fabricated addresses must never enter live signing flows.
- Initialize the Meteora client inside invoked service factories; browser wallet-standard access and crypto run only after hydration or user interaction.
- Keep settings and strategy repositories inside the console provider, session-only and isolated per SSR request; production persistence requires a secured metadata repository excluding cryptographic secrets.
- Verification uses an explicitly isolated public-demo WOTS encoding, with QUANTEK-owned domain strings and no third-party protocol compatibility claims, so demonstration proofs cannot be misrepresented.

- Wallet signing adapters freeze the reviewed message, verify RPC genesis/fee payer/blockhash, simulate without replacing the blockhash, recheck changes and verify returned signed bytes; submission remains separate to prevent unreviewed writes.
- All existing public and operational routes share a desktop shell with grouped source navigation, global menus and an icon Dock so no retained capability depends on a single navigation surface.
- Independent public parity modules live under `qli`; they share the existing console context and wallet-review boundary so demo market records can never enter signing adapters.
- Browser ML-DSA vault keys live only in the request-isolated provider's tab memory and are wiped on clear/unmount; offline backup is explicit, never persisted or uploaded.
- Public crypto endpoints under `/api/public/v1/*` accept bounded public material only and dynamically load crypto handlers; no custodial signing or private-key endpoint exists.
- Resolve rpc-websockets to its browser bundle for Worker compatibility because its node-only export condition cannot resolve in the published Worker environment.
- Preserve existing qtk1 proof encodings, ledger keys and domain strings through display renames so consumed-key tracking and public proof verification remain compatible.
- Hash-signature primitives live in pq.ts, identity derivation/ledger/memo in identity.ts, vault modeling in quantum-wallet.ts; the leaf ledger persists only consumed indexes so secrets never touch storage.
- The Quantum Wallet adapter refuses live construction while its program id is null, so no third-party program can be silently used.
- Theme public and retained operational surfaces through shared semantic CSS and dialog slots so presentation changes do not alter signing or proof logic.
- Load intended cosmic artwork from `/quantum-qli-hero.webp`, hiding it until decoded with a CSS fallback so swapping the user's exact image requires no layout change.
- Keep movable window state frontend-only, bounded and keyboard-adjustable; collapse overlays to document flow on smaller screens so windows cannot strand controls or obscure mobile forms.
- Utility console output uses public session statuses and reviewed-plan titles only, never raw RPC URLs, identity secret material or backup keys, to preserve noncustodial privacy.
- Keep first-party documentation bodies in docs/*.md and bundle the same sources into the help reader; stable article search parameters and section hashes preserve shareable help links without duplicated content.
- Keep the versioned white paper in docs/whitepaper/index.md, separate from the 27-article catalog; the reader bundles one source and prints all sections to prevent export/content divergence.
- Compose direct Vite, TanStack Start, React, Tailwind and build-only Nitro plugins in first-party configuration; preserve the custom server entry and browser aliases because the production runtime has no external module resolution.
- Use the first-party lazy browser auth client and session-header middleware; sessions must stay on the app origin and must never be forwarded to ancestor frames.
- Keep lowercase front-matter articles in the help catalog and uppercase repository policies outside it; this prevents repository prose from breaking the 27-article reader.
- Emit allowlisted local error categories, never thrown payloads, stacks or raw URLs; this avoids exposing secret-bearing error data.
- Run frozen-lock install, formatting, lint, type validation, tests, production build and repository hygiene checks in CI; release checks must fail rather than conceal incomplete neutralization.
- Replace unmaintained vulnerable transitive packages with reviewed first-party workspace packages under `packages/` wired through `overrides`; never suppress or filter audit findings, so the audit stays truthful.
- Keep React contexts, hooks and non-component helpers in separate non-component modules from their providers; this keeps fast refresh reliable and lint warning-free.
