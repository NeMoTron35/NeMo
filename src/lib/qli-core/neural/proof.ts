// NEMOTRON3.5 Proof Engine v3.5: tamper-evident ledger records. Unsigned; not on-chain; not a proof of model output.
import { z } from "zod";
import { domainHash } from "./canonical";
import { PROMPT_POLICY_VERSION, policyVerdict, snapshotSchema, type Snapshot } from "./engine";

export const PROOF_DOMAIN = "qli.proof-engine/v3.5/record";
export const SNAPSHOT_DOMAIN = "qli.proof-engine/v3.5/snapshot";
export const SIM_DOMAIN = "qli.proof-engine/v3.5/simulation-config";
export const GENESIS = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
} as const;

export const recordSchema = z.object({
  version: z.literal("3.5"),
  domain: z.literal(PROOF_DOMAIN),
  chain: z.object({
    network: z.enum(["mainnet-beta", "devnet"]),
    genesis: z.string(),
    slot: z.string().regex(/^\d+$/).nullable(),
  }),
  snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
  engine: z.object({
    kind: z.enum(["deterministic", "hf"]),
    id: z.string().max(120),
    version: z.string().max(60),
    provider: z.string().max(60),
  }),
  modelEvidence: z.object({
    answerHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    validated: z.boolean(),
  }),
  promptPolicyVersion: z.string(),
  simulationConfigHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  verdict: z.enum(["no-action", "owner-review", "re-read-required"]),
  chainTxSubmitted: z.literal(false),
  proposal: z.object({
    status: z.enum(["none", "review-only"]),
    expiresAt: z.number().int().nullable(),
  }),
  createdAt: z.number().int().positive(),
});
export type ProofBody = z.infer<typeof recordSchema>;
export type ProofRecord = ProofBody & { hash: string };

export async function buildRecord(input: {
  snapshot: Snapshot;
  engine: ProofBody["engine"];
  answerHash: string | null;
  validated: boolean;
  simulationConfig?: unknown;
  createdAt: number;
}): Promise<ProofRecord> {
  const verdict = policyVerdict(input.snapshot);
  const body: ProofBody = {
    version: "3.5",
    domain: PROOF_DOMAIN,
    chain: {
      network: input.snapshot.network,
      genesis: GENESIS[input.snapshot.network],
      slot: input.snapshot.slot,
    },
    snapshotHash: await domainHash(SNAPSHOT_DOMAIN, input.snapshot),
    engine: input.engine,
    modelEvidence: { answerHash: input.answerHash, validated: input.validated },
    promptPolicyVersion: PROMPT_POLICY_VERSION,
    simulationConfigHash:
      input.simulationConfig === undefined
        ? null
        : await domainHash(SIM_DOMAIN, input.simulationConfig),
    verdict,
    chainTxSubmitted: false,
    proposal:
      verdict === "owner-review"
        ? { status: "review-only", expiresAt: input.createdAt + 900 }
        : { status: "none", expiresAt: null },
    createdAt: input.createdAt,
  };
  return { ...body, hash: await domainHash(PROOF_DOMAIN, body) };
}

export type VerifyResult = {
  structure: boolean;
  hashMatches: boolean;
  genesisMatches: boolean;
  snapshotReplayed: "not-provided" | "match" | "mismatch";
  verdictReplayed: "not-provided" | "match" | "mismatch";
  note: string;
};

/** Recomputes hashes and the deterministic verdict only. Never re-runs or "proves" model output. */
export async function verifyRecord(raw: unknown, snapshot?: unknown): Promise<VerifyResult> {
  const fail: VerifyResult = {
    structure: false,
    hashMatches: false,
    genesisMatches: false,
    snapshotReplayed: "not-provided",
    verdictReplayed: "not-provided",
    note: "Record does not match the v3.5 schema.",
  };
  if (!raw || typeof raw !== "object") return fail;
  const { hash, ...rest } = raw as Record<string, unknown>;
  const p = recordSchema.strict().safeParse(rest);
  if (!p.success || typeof hash !== "string") return fail;
  const body = p.data;
  const out: VerifyResult = {
    structure: true,
    hashMatches: (await domainHash(PROOF_DOMAIN, body)) === hash,
    genesisMatches: GENESIS[body.chain.network] === body.chain.genesis,
    snapshotReplayed: "not-provided",
    verdictReplayed: "not-provided",
    note: "Tamper-evident hash check only. Not signed, not on-chain, and model output is not reproducible.",
  };
  if (snapshot !== undefined) {
    const s = snapshotSchema.safeParse(snapshot);
    if (!s.success) {
      out.snapshotReplayed = "mismatch";
      out.verdictReplayed = "mismatch";
    } else {
      out.snapshotReplayed =
        (await domainHash(SNAPSHOT_DOMAIN, s.data)) === body.snapshotHash ? "match" : "mismatch";
      out.verdictReplayed = policyVerdict(s.data) === body.verdict ? "match" : "mismatch";
    }
  }
  return out;
}
