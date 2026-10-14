# QLi Threat Graph v4.5

Owner-scoped relationship graph built only from rows the server verified at registration (pools: creator, base/quote mint; vaults: owner, mint, program). Every edge carries source table, slot and observation time; duplicates are removed; other networks are excluded. No external discovery, identity inference, labelling of people or automatic blocking.

Signals (patterns with stated confidence): creator-mismatch, read-failures, never-observed, shared-base-mint, upgradeable-program, program-hash-divergence. Vault rows exist only once a verified Quantum Vault deployment is configured (currently none).
