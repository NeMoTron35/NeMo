# Contributing to NEMOTRON3.5

Review [AGENTS.md](AGENTS.md), [SECURITY.md](SECURITY.md) and [licensing status](docs/LICENSING.md) first. Public visibility is not an open-source license grant.

## Local setup

Use Node.js 22+ and Bun 1.3.3. Install with `bun install --frozen-lockfile` and run `bun run dev` at http://localhost:8080. Backend auth is optional for demo/public crypto tools; configure names from `.env.example` in your local process or deployment secret store. Never commit values or a populated environment file.

## Branch, commit and PR standards

- Use focused branches such as `fix/review-validation`, `feat/help-reader` or `docs/security-boundaries`.
- Keep commits scoped; use `fix:`, `feat:`, `docs:`, `test:` or `chore:` summaries explaining intent.
- Do not rewrite a shared branch's history. Submit a PR with motivation, sanitized evidence and compatibility risks.
- Changes to signing, proof encodings, auth or persistence require explicit review and regression tests. Do not merge failing checks.

## Required checks

```sh
bun install --frozen-lockfile
bun run format
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
bun run check:repository
```

Formatting may touch existing files; review the diff. UI work also requires desktop 1280px, mobile 390px and keyboard checks. Keep lowercase `docs/*.md` articles with front matter in the 27-topic help catalog; repository-only policies use uppercase filenames. The white paper has its own single Markdown source.

Never turn a demo result into a mainnet success claim. New external adapters must fail closed. See [release process](RELEASE.md) and [roadmap](roadmap.md). Report vulnerabilities privately using [SECURITY.md](SECURITY.md), not public issues.
