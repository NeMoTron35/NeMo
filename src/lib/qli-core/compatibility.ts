/**
 * Frozen v1 protocol identifiers, not current product branding.
 * Changing these bytes invalidates existing proofs, derived identities or consumed-leaf lookups.
 * The public demo input is intentionally public and MUST NEVER be used for live attribution.
 */
export const DOMAINS = {
  identity: "quantek.network/identity/v1",
  launch: "quantek.network/launch/v1",
  proof: "quantek.network/proof/v1",
  quantumWallet: "quantek.network/quantum-wallet/v1",
} as const;
export const WOTS_PROOF_KIND = "quantek-wots16-merkle-v1";
export const LEAF_LEDGER_PREFIX = "quantek.ledger.v1:";
export const IDENTITY_MEMO_PREFIX = "quantek:v1:identity:";
export const POSSESSION_MESSAGE_PREFIX = "quantek:v1:possession:";
export const REGISTRATION_MESSAGE_PREFIX = "quantek:v1:register:";
export const PUBLIC_DEMO_INPUT = "QUANTEK PUBLIC DEMO — KNOWN SECRET — NEVER USE LIVE";
