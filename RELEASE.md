# Release process

## Versioning

Use semantic versioning. Before 1.0, increment the minor version for breaking public API/proof/storage behavior and the patch version for compatible fixes. Preserve old proof/domain encodings or supply a reviewed migration; cosmetic renaming is not permission to reset used-leaf tracking.

## Repeatable checklist

1. Start from the reviewed default branch, a clean checkout and the documented Node/Bun versions.
2. Run frozen-lock install, formatting check, lint, type validation, the full suite, production build and `check:repository` from CONTRIBUTING.md.
3. Run `bun run audit:dependencies`; the locked versions are checked against the public npm advisory service. Resolve applicable vulnerabilities and review upstream/transitive findings. Do not waive failing checks silently.
4. Verify /docs, /whitepaper, print export, 1280px/390px layout, keyboard menus and signing/proof workflows. Confirm demo/live labeling and network/genesis checks.
5. Review dependencies, generated output and environment handling. No populated environment files or private credentials may ship. Confirm source and filename neutrality checks pass.
6. Update package version, changelog and documentation together. White-paper edition is separate from package version; update it only when the paper changes substantively.
7. Have maintainers review changes and merge only green checks. Create a matching `vX.Y.Z` tag and GitHub release with known limitations and sanitized validation evidence.
8. Deploy `dist/server` and `dist/client` using a compatible Worker host. Configure secrets outside the repository, verify redirects/auth on the deployed origin, and smoke-test public APIs and route metadata. Build success alone is not deployment.

Retain the previous reviewed artifact for rollback. Do not roll back a one-time-leaf ledger by restoring an old browser snapshot. There is no production key custody, autonomous trading release or verifier deployment implied by this process.
