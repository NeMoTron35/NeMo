// QLi Launch Proof Engine v1: verifies a Meteora DBC launch from real RPC evidence and emits a
// tamper-evident receipt. Pure core (no I/O): the RPC and account decoder are injected, so the
// same logic runs on the server and in tests. Read-only: nothing here builds, signs or sends.
import { z } from "zod";
import { domainHash } from "./neural/canonical";

export const LAUNCH_PROOF_VERSION = "1";
export const RECEIPT_DOMAIN = "qli.launch-proof/v1/receipt";
export const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
export const PROOF_GENESIS = {
  "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
} as const;
export type ProofNetwork = keyof typeof PROOF_GENESIS;
export const networkSchema = z.enum(["mainnet-beta", "devnet"]);

/** Bounds that keep a single lookup from turning into an RPC scan. */
export const MAX_TX_ACCOUNTS = 256;
export const MAX_POOL_CANDIDATES = 12;
const POOL_INIT_LOG = /^Program log: Instruction: InitializeVirtualPoolWith(SplToken|Token2022)$/;
const CONFIG_LOG = /^Program log: Instruction: CreateConfig$/;

function decodedLength(s: string, max: number): number | null {
  if (typeof s !== "string" || s.length < 32 || s.length > max) return null;
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)) return null;
  return base58Decode(s).length;
}
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Minimal base58 decoder (input pre-validated against the alphabet and length-bounded). */
export function base58Decode(s: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of s) {
    let carry = B58.indexOf(ch);
    if (carry < 0) throw new Error("Invalid base58.");
    for (let j = 0; j < bytes.length; j++) {
      carry += (bytes[j] ?? 0) * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of s) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}
export const isSignature = (s: string) => decodedLength(s, 90) === 64;
export const isAddress = (s: string) => decodedLength(s, 44) === 32;

export type AccountView = { owner: string; lamports: number; data: Uint8Array } | null;
export type TxView = {
  slot: number;
  blockTime: number | null;
  err: unknown;
  accountKeys: { pubkey: string; signer: boolean; writable: boolean }[];
  preBalances: number[];
  postBalances: number[];
  logs: string[];
  /** Top-level and inner instructions, by account-key index. */
  instructions: { programIndex: number; accounts: number[] }[];
};
export type ProofRpc = {
  genesis(): Promise<string>;
  status(sig: string): Promise<{
    confirmationStatus: "processed" | "confirmed" | "finalized" | null;
    err: unknown;
    slot: number;
  } | null>;
  transaction(sig: string): Promise<TxView | null>;
  accounts(keys: string[]): Promise<{ slot: number; values: AccountView[] }>;
};
export type DecodedPool = {
  config: string;
  creator: string;
  baseMint: string;
  baseReserve: string;
  quoteReserve: string;
};
export type DecodedConfig = { quoteMint: string; migrationOption: number };
export type ProofDecoder = {
  pool(data: Uint8Array): DecodedPool | null;
  config(data: Uint8Array): DecodedConfig | null;
  derivePool(quoteMint: string, baseMint: string, config: string): string;
};

export type FailureCode =
  | "invalid-input"
  | "not-found"
  | "pending"
  | "failed"
  | "rpc-unavailable"
  | "rate-limited"
  | "wrong-genesis"
  | "not-a-dbc-launch"
  | "incomplete-link"
  | "ambiguous"
  | "account-mismatch"
  | "oversized";

export const FAILURE_TEXT: Record<FailureCode, string> = {
  "invalid-input": "Invalid network or signature (a signature is 64 bytes in base58).",
  "not-found": "No transaction with this signature was found on this network.",
  pending: "The transaction is not yet confirmed. Check again shortly.",
  failed: "The transaction failed on chain. No launch was created.",
  "rpc-unavailable": "The Solana RPC endpoint is unavailable. Nothing was verified.",
  "rate-limited": "The Solana RPC endpoint rate-limited this lookup (HTTP 429/403). Try later.",
  "wrong-genesis": "The RPC endpoint does not serve the selected network (genesis mismatch).",
  "not-a-dbc-launch":
    "The transaction succeeded but did not initialize a Meteora DBC pool. It is not a launch.",
  "incomplete-link":
    "DBC was invoked, but a newly created DBC-owned pool could not be derived from this transaction. Unverified.",
  ambiguous: "More than one candidate pool was found. Refusing to guess. Unverified.",
  "account-mismatch": "Pool, config, mint or creator accounts do not correspond. Unverified.",
  oversized: "The transaction exceeds verification bounds. Unverified.",
};

export const factsSchema = z
  .object({
    program: z.literal(DBC_PROGRAM),
    pool: z.string(),
    config: z.string(),
    baseMint: z.string(),
    quoteMint: z.string(),
    creator: z.string(),
    migration: z.enum(["damm-v1", "damm-v2", "unknown"]),
    poolOwner: z.literal(DBC_PROGRAM),
    configOwner: z.literal(DBC_PROGRAM),
    poolCreatedInTx: z.literal(true),
    configCreatedInTx: z.boolean(),
    mintCreatedInTx: z.boolean(),
    creatorSigned: z.literal(true),
  })
  .strict();
export type LaunchFacts = z.infer<typeof factsSchema>;

export const receiptBodySchema = z
  .object({
    version: z.literal(LAUNCH_PROOF_VERSION),
    domain: z.literal(RECEIPT_DOMAIN),
    evidenceClass: z.literal("confirmed-on-chain"),
    status: z.literal("verified"),
    network: networkSchema,
    genesis: z.string(),
    signature: z.string(),
    slot: z.string().regex(/^\d+$/),
    blockTime: z.number().int().nullable(),
    txError: z.null(),
    commitment: z.enum(["confirmed", "finalized"]),
    verifiedAt: z.number().int().positive(),
    facts: factsSchema,
    intentLinkage: z.literal("unverified"),
    attestation: z.literal("local-integrity-checksum-not-signed"),
  })
  .strict();
export type ReceiptBody = z.infer<typeof receiptBodySchema>;
export type LaunchReceipt = ReceiptBody & { digest: string };

export type Observed = {
  slot: string;
  baseReserve: string;
  quoteReserve: string;
  readAt: number;
};
export type ProofResult =
  | { ok: true; receipt: LaunchReceipt; observed: Observed }
  | {
      ok: false;
      code: FailureCode;
      message: string;
      network?: ProofNetwork;
      signature?: string;
      txError?: string;
    };

const fail = (code: FailureCode, extra: Partial<Extract<ProofResult, { ok: false }>> = {}) =>
  ({ ok: false, code, message: FAILURE_TEXT[code], ...extra }) as const;

function rpcFailure(e: unknown): FailureCode {
  const m = e instanceof Error ? e.message : String(e);
  return /\b(429|403)\b|too many requests|rate/i.test(m) ? "rate-limited" : "rpc-unavailable";
}
const boundedErr = (e: unknown) => {
  try {
    return JSON.stringify(e).slice(0, 200);
  } catch {
    return "error";
  }
};

export async function verifyLaunch(
  input: { network: string; signature: string },
  rpc: ProofRpc,
  dec: ProofDecoder,
  now: () => number = () => Math.floor(Date.now() / 1000),
): Promise<ProofResult> {
  const n = networkSchema.safeParse(input.network);
  if (!n.success || !isSignature(input.signature)) return fail("invalid-input");
  const network = n.data;
  const signature = input.signature;
  const ctx = { network, signature };
  try {
    if ((await rpc.genesis()) !== PROOF_GENESIS[network]) return fail("wrong-genesis", ctx);
    const st = await rpc.status(signature);
    if (!st) return fail("not-found", ctx);
    if (st.err) return fail("failed", { ...ctx, txError: boundedErr(st.err) });
    if (st.confirmationStatus !== "confirmed" && st.confirmationStatus !== "finalized")
      return fail("pending", ctx);
    const commitment = st.confirmationStatus;
    const tx = await rpc.transaction(signature);
    if (!tx) return fail("pending", ctx);
    if (tx.err) return fail("failed", { ...ctx, txError: boundedErr(tx.err) });
    const keys = tx.accountKeys;
    if (keys.length > MAX_TX_ACCOUNTS || tx.logs.length > 2000) return fail("oversized", ctx);

    const dbcIdx = keys.findIndex((k) => k.pubkey === DBC_PROGRAM);
    const dbcIxs = tx.instructions.filter((i) => i.programIndex === dbcIdx);
    if (dbcIdx < 0 || dbcIxs.length === 0 || !tx.logs.some((l) => POOL_INIT_LOG.test(l)))
      return fail("not-a-dbc-launch", ctx);

    const created = (i: number) => (tx.preBalances[i] ?? -1) === 0 && (tx.postBalances[i] ?? 0) > 0;
    const idxSet = new Set<number>();
    for (const ix of dbcIxs) for (const a of ix.accounts) idxSet.add(a);
    const candidates = [...idxSet].filter(
      (i) => !!keys[i]?.writable && !keys[i]?.signer && created(i),
    );
    if (candidates.length === 0) return fail("incomplete-link", ctx);
    if (candidates.length > MAX_POOL_CANDIDATES) return fail("oversized", ctx);

    const candKeys = candidates.map((i) => keys[i]!.pubkey);
    const cand = await rpc.accounts(candKeys);
    const pools: { addr: string; pool: DecodedPool }[] = [];
    cand.values.forEach((acc, j) => {
      const addr = candKeys[j];
      if (!acc || !addr || acc.owner !== DBC_PROGRAM) return;
      const p = dec.pool(acc.data);
      if (p) pools.push({ addr, pool: p });
    });
    const only = pools[0];
    if (!only) return fail("incomplete-link", ctx);
    if (pools.length > 1) return fail("ambiguous", ctx);
    const { addr: poolAddr, pool } = only;

    const cfgIdx = keys.findIndex((k) => k.pubkey === pool.config);
    if (cfgIdx < 0) return fail("account-mismatch", ctx);
    const cfgRead = await rpc.accounts([pool.config]);
    const cfgAcc = cfgRead.values[0];
    if (!cfgAcc || cfgAcc.owner !== DBC_PROGRAM) return fail("account-mismatch", ctx);
    const cfg = dec.config(cfgAcc.data);
    if (!cfg) return fail("account-mismatch", ctx);

    if (dec.derivePool(cfg.quoteMint, pool.baseMint, pool.config) !== poolAddr)
      return fail("account-mismatch", ctx);
    const creatorKey = keys.find((k) => k.pubkey === pool.creator);
    if (!creatorKey?.signer) return fail("account-mismatch", ctx);
    const mintIdx = keys.findIndex((k) => k.pubkey === pool.baseMint);
    if (mintIdx < 0) return fail("account-mismatch", ctx);

    const facts: LaunchFacts = {
      program: DBC_PROGRAM,
      pool: poolAddr,
      config: pool.config,
      baseMint: pool.baseMint,
      quoteMint: cfg.quoteMint,
      creator: pool.creator,
      migration:
        cfg.migrationOption === 1 ? "damm-v2" : cfg.migrationOption === 0 ? "damm-v1" : "unknown",
      poolOwner: DBC_PROGRAM,
      configOwner: DBC_PROGRAM,
      poolCreatedInTx: true,
      configCreatedInTx: created(cfgIdx) && tx.logs.some((l) => CONFIG_LOG.test(l)),
      mintCreatedInTx: created(mintIdx),
      creatorSigned: true,
    };
    const t = now();
    const body: ReceiptBody = {
      version: LAUNCH_PROOF_VERSION,
      domain: RECEIPT_DOMAIN,
      evidenceClass: "confirmed-on-chain",
      status: "verified",
      network,
      genesis: PROOF_GENESIS[network],
      signature,
      slot: String(tx.slot),
      blockTime: tx.blockTime,
      txError: null,
      commitment,
      verifiedAt: t,
      facts,
      intentLinkage: "unverified",
      attestation: "local-integrity-checksum-not-signed",
    };
    return {
      ok: true,
      receipt: { ...body, digest: await domainHash(RECEIPT_DOMAIN, body) },
      observed: {
        slot: String(cand.slot),
        baseReserve: pool.baseReserve,
        quoteReserve: pool.quoteReserve,
        readAt: t,
      },
    };
  } catch (e) {
    return fail(rpcFailure(e), ctx);
  }
}

export type ReceiptCheck = { structure: boolean; digestMatches: boolean; note: string };
/** Recomputes the digest only. Proves the JSON was not edited; not a signature or on-chain attestation. */
export async function verifyReceipt(raw: unknown): Promise<ReceiptCheck> {
  const note =
    "Local integrity checksum only: not signed, not an oracle, not on-chain. Re-run the lookup to re-verify chain state.";
  if (!raw || typeof raw !== "object") return { structure: false, digestMatches: false, note };
  const { digest, ...rest } = raw as Record<string, unknown>;
  const p = receiptBodySchema.safeParse(rest);
  if (!p.success || typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest))
    return { structure: false, digestMatches: false, note };
  if (p.data.genesis !== PROOF_GENESIS[p.data.network])
    return { structure: true, digestMatches: false, note };
  return {
    structure: true,
    digestMatches: (await domainHash(RECEIPT_DOMAIN, p.data)) === digest,
    note,
  };
}

/** Shareable path; only validated values are ever interpolated. */
export function proofPath(network: ProofNetwork, signature: string) {
  if (!isSignature(signature)) throw new Error("Invalid signature.");
  return `/launch-proofs/${network}/${signature}`;
}

// ---- Local reviewed-intent record (this browser only, bounded, no secrets) ----
export const INTENT_KEY = "qli.launch-intents.v1";
export const MAX_INTENTS = 10;
export type LocalIntent = {
  signature: string;
  network: ProofNetwork;
  intentHash: string;
  symbol: string;
  savedAt: number;
};
const intentSchema = z
  .object({
    signature: z.string().refine(isSignature),
    network: networkSchema,
    intentHash: z.string().regex(/^[0-9a-f]{64}$/),
    symbol: z.string().max(16),
    savedAt: z.number().int(),
  })
  .strict();
export function readIntents(storage: Pick<Storage, "getItem">): LocalIntent[] {
  try {
    const v = JSON.parse(storage.getItem(INTENT_KEY) ?? "[]");
    return Array.isArray(v)
      ? v.flatMap((x) => {
          const p = intentSchema.safeParse(x);
          return p.success ? [p.data] : [];
        })
      : [];
  } catch {
    return [];
  }
}
export function saveIntent(storage: Pick<Storage, "getItem" | "setItem">, i: LocalIntent) {
  const p = intentSchema.parse(i);
  const list = [p, ...readIntents(storage).filter((x) => x.signature !== p.signature)].slice(
    0,
    MAX_INTENTS,
  );
  storage.setItem(INTENT_KEY, JSON.stringify(list));
}
