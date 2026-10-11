# QLi Proof Engine v3.5

Each analysis or Shadow run produces an unsigned, tamper-evident ledger record: `sha256("qli.proof-engine/v3.5/record\n" + canonicalJson(body))`. Canonical JSON = recursively sorted keys, no whitespace, safe integers only, bigints as decimal strings.

Body fields: version, domain, chain (network, genesis, slot), snapshotHash (domain-separated), engine (deterministic or hf with id/version/provider), modelEvidence (answer hash, validated), promptPolicyVersion, simulationConfigHash, deterministic policy verdict, `chainTxSubmitted: false`, proposal (none / review-only + expiry), createdAt.

Verification (Proof tab, runs in the browser, no server call): schema, hash, genesis/network match, and optional replay of the snapshot hash and deterministic verdict. It does **not** prove model output (stochastic) and is not a signature, blockchain attestation or on-chain proof. Chain data and model output are separate evidence classes.