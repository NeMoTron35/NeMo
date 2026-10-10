# Dependency audit status

Run `bun run audit:dependencies` to check every version recorded in the Bun lockfile against npm's public advisory service. The audit submits only public package names and versions, requires no repository secrets, times out on unavailable service responses and fails on high/critical findings.

The October 10, 2026 check reports remaining high advisories in transitive `bigint-buffer`, `toml` and both legacy/current `brace-expansion` lines. Moderate transitive `esbuild` and `uuid` findings are also reported. These are not waived by the workflow. Compatible overrides fix `js-yaml`, `nanoid`, `source-map-js` and `stream-json`; they do not make the complete tree vulnerability-free.

The buffer package's native conversion path is used by upstream Solana dependencies; the app cannot claim a patch simply because a browser build commonly selects pure JavaScript. The TOML parser is upstream SDK tooling, but arbitrary-input risk still requires review. Brace expansion spans incompatible major dependency ranges; forcing one major everywhere without compatibility review is not an acceptable fix.

Before a release, maintainers must obtain compatible upstream updates or review/test replacement adapters, refresh the frozen lockfile and rerun the complete checks. Do not mark security checks green, claim an independent audit or ship production signing changes to hide these findings. The normal CI suite and dependency-security workflow intentionally report separate outcomes.