# First-party interface layer

Quantum QLi keeps a deliberately small first-party interface layer around the accessibility primitives it uses.

The components under `src/components/ui/` are maintained as Quantum QLi code rather than generator snapshots. Their public APIs stay intentionally small so product code can evolve without inheriting a large generic component catalog.

## Design rules

- Preserve Radix accessibility and keyboard behavior.
- Keep Quantum QLi-specific data attributes and naming at the wrapper boundary.
- Prefer product-specific composition over copying generic component registries.
- Do not modify standardized legal, security or protocol text merely to reduce external similarity scores.
- Treat exact compatibility bytes in `src/lib/qli-core/compatibility.ts` as frozen protocol data, not branding.

This file documents maintainability intent; it is not a claim that third-party dependencies or standards are proprietary to Quantum QLi.
