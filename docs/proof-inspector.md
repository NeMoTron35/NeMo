---
id: proof-inspector
title: Proof Inspector
group: Identity and proofs
summary: Inspect launch, identity and wallet-spend reference proofs.
---

# Proof Inspector

Open `/verify`. Select launch attestation, identity proof or wallet spend proof. Load valid/tampered demonstration material or supply public JSON, then run verification. Inspect valid/invalid results, signature byte counts and the proof trace.

## What verification checks

The WOTS verifier validates supported kind/domain, dimensions and encodings; hashes the supplied message with the versioned domain; finishes signature chains; reconstructs the leaf and Merkle path; and compares the recovered root. Changing the message should invalidate the example.

## What verification does not check

A valid proof does not establish a deployed vault, a confirmed launch, a globally unique identity, current asset ownership or economic correctness. A public-demo proof authenticates only a demonstration with a published secret. Verification does not execute transactions.

For launch attestations, understand [the committed fields](/docs?article=launch-forge#exact-seal-scope).