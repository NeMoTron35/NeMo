---
id: local-development
title: Local development
group: Developers
summary: Commands matching the current package scripts.
---

# Local development

## Install and run

The project uses TypeScript, React 19, TanStack Start and Vite. Use Bun to install this checkout’s dependencies; a Bun lockfile is present.

```sh
bun install --frozen-lockfile
bun run dev
```

Open http://localhost:8080. A full server runtime is required for public API routes; static file serving is not equivalent. Optional backend auth configuration is documented in [Configuration](/docs?article=configuration); use deployment environment variables, never commit populated environment files.

## Test and quality checks

```sh
bun run test
bun run test:watch
bun run lint
bun run format
bun run format:check
bun run typecheck
bun run check:repository
```

Tests use Vitest with jsdom by default; some protocol tests choose the Node environment explicitly. The existing routing, parity, WOTS, launch, wallet and boundary suites do not replace an installed-wallet end-to-end check.

## Build and preview

```sh
bun run build
bun run build:dev
bun run preview
```

These map to `vite build`, `vite build --mode development` and `vite preview`. Preview is a local inspection command, not deployment. CI validates production output. Do not introduce a competing bootstrap or edit the generated route tree. See root CONTRIBUTING.md and RELEASE.md for contributor and release requirements.

## Documentation changes

Edit Markdown under `docs/`. The in-app reader loads those same files through Vite raw imports; there is no separately maintained body copy. Front matter defines stable id, title, group and summary. Keep claims linked to actual implementation and update documentation tests when adding required topics.
