// Hook Enforcement Proof v2 — pure core. Browser-safe; RPC and SDK decoding are injected.
// Verifies a Token-2022 transfer-hook + Meteora DBC TransferHookPool + DAMM v2 graduation story
// strictly from observed chain data. Never signs, never builds transactions, never guesses.
import { z } from "zod";
import { domainHash } from "./neural/canonical";
import { DBC_PROGRAM, PROOF_GENESIS, isAddress, isSignature } from "./launch-proof";

export const HOOK_PROOF_VERSION = "qli-hook-proof/v2" as const;
export const HOOK_PROOF_DOMAIN = "QuantumQLi.HookProof.Receipt.v2";
export const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const DAMM_V2_PROGRAM = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";
export const TRANSFER_HOOK_POOL_DISC = [237, 219, 184, 23, 42, 189, 169, 35] as const;
/** QLi research hook config layout tag (programs/quantum_transfer_hook). */
export const QLI_CONFIG_TAG = "QLIHOOK1";
/** Positions in the SDK 1.5.13 IDL `migrationDammV2` account list. */
export const MIGRATION_IX = {
  name: "migrationDammV2",
  virtualPool: 0,
  pool: 4,
  baseMint: 13,
} as const;
/** Positions in the SDK 1.5.13 IDL `swap2WithTransferHook` account list. */
export const SWAP_HOOK_ACCOUNTS = { pool: 2, baseMint: 7 } as const;
export const SWAP_HOOK_IX = "swap2WithTransferHook";

export const TIERS = [
  "NOT_CONFIGURED",
  "LOCAL_UNIT_TESTED",
  "LOCAL_VALIDATOR_TESTED",
  "DEVNET_PROGRAM_DEPLOYED",
  "DBC_VERIFIED",
  "MIGRATION_VERIFIED",
  "POST_GRAD_VERIFIED",
] as const;
export type Tier = (typeof TIERS)[number];

/** Repository evidence, updated only from actually executed local test runs. */
export const REPOSITORY_EVIDENCE = {
  unitTests: "PASSED" as "PASSED" | "NOT_RUN",
  /** solana-program-test BanksServer, bundled Token-2022, hook as native processor (not SBF-compiled). */
  localValidatorCpi: "PASSED" as "PASSED" | "BLOCKED" | "SEE_DOCS",
  deployedProgramId: null as string | null,
  audit: "NONE" as const,
};

const addr = z.string().max(44).refine(isAddress, "Not a valid Solana address.");
export const proofInputSchema = z
  .object({
    network: z.literal("devnet"),
    mint: addr,
    hookProgram: addr,
    dbcPool: addr.optional(),
    dammPool: addr.optional(),
    txs: z
      .array(
        z
          .object({
            signature: z.string().max(90).refine(isSignature, "Not a valid signature."),
            claim: z.enum(["transfer-allow", "transfer-deny", "dbc-swap", "migration"]),
          })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict();
export type ProofInput = z.infer<typeof proofInputSchema>;

export type ChainAccount = { owner: string; executable: boolean; data: Uint8Array } | null;
export type ChainIx = { programId: string; accounts: string[]; data: Uint8Array };
export type ChainTx = {
  slot: number;
  err: unknown;
  confirmation: string | null;
  accountKeys: string[];
  logs: string[];
  instructions: ChainIx[];
};
export type ProofRpc = {
  genesis(): Promise<string>;
  accounts(a: string[]): Promise<{ slot: number; values: ChainAccount[] }>;
  transaction(sig: string): Promise<ChainTx | null>;
  derive(mint: string, hookProgram: string): { extraMetas: string; qliConfig: string };
};
export type ProofDecoder = {
  poolState(data: Uint8Array): { baseMint: string; config: string; isMigrated: number } | null;
  dbcIxName(data: Uint8Array): string | null;
};

export type Check = {
  id: string;
  label: string;
  status: "pass" | "fail" | "unknown";
  detail: string;
  slot?: number;
};
export type TxVerdict = {
  signature: string;
  claim: string;
  status: "verified" | "rejected" | "unproven";
  phase: "pre-graduation" | "post-graduation" | "n/a";
  detail: string;
  slot: number | null;
};
export type HookProof = {
  ok: boolean;
  code: "ok" | "wrong-network" | "rpc-unavailable" | "invalid-input" | "rate-limited";
  message: string;
  version: typeof HOOK_PROOF_VERSION;
  network: "devnet";
  observedSlot: number | null;
  tier: Tier;
  checks: Check[];
  txs: TxVerdict[];
  policy: {
    layout: "qli-research-v1" | "unknown";
    paused: boolean | null;
    allowlist: boolean | null;
    allowCount: number | null;
  };
  receipt: {
    digest: string;
    integrity: "sha256 integrity checksum, not a signature, attestation or audit";
  } | null;
};

export function failure(code: HookProof["code"], message: string): HookProof {
  return {
    ok: false,
    code,
    message,
    version: HOOK_PROOF_VERSION,
    network: "devnet",
    observedSlot: null,
    tier: "NOT_CONFIGURED",
    checks: [],
    txs: [],
    policy: { layout: "unknown", paused: null, allowlist: null, allowCount: null },
    receipt: null,
  };
}

/** Token-2022 TLV lookup after the 165-byte base and account-type byte. */
export function tlv(data: Uint8Array, accountType: number, ext: number): Uint8Array | null {
  if (data.length <= 165 || data[165] !== accountType) return null;
  let o = 166;
  while (o + 4 <= data.length) {
    const t = data[o]! | (data[o + 1]! << 8);
    const l = data[o + 2]! | (data[o + 3]! << 8);
    if (o + 4 + l > data.length) return null;
    if (t === ext) return data.subarray(o + 4, o + 4 + l);
    if (t === 0 && l === 0) return null;
    o += 4 + l;
  }
  return null;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58(bytes: Uint8Array): string {
  let x = 0n;
  for (const b of bytes) x = (x << 8n) | BigInt(b);
  let o = "";
  while (x > 0n) {
    o = B58[Number(x % 58n)] + o;
    x /= 58n;
  }
  for (const b of bytes) {
    if (b) break;
    o = "1" + o;
  }
  return o;
}

export function mintHookProgram(data: Uint8Array): string | null {
  const v = tlv(data, 1, 14);
  if (!v || v.length !== 64) return null;
  const p = v.subarray(32, 64);
  return p.every((b) => b === 0) ? null : b58(p);
}

export function decodeQliConfig(data: Uint8Array) {
  if (data.length !== 8 + 4 + 64 + 1 + 256) return null;
  if (new TextDecoder().decode(data.subarray(0, 8)) !== QLI_CONFIG_TAG || data[8] !== 1)
    return null;
  if (data[76]! > 8 || data[10]! > 1 || data[11]! > 1) return null;
  return {
    paused: data[10] === 1,
    allowlist: data[11] === 1,
    allowCount: data[76]!,
    mint: b58(data.subarray(44, 76)),
  };
}

const invoked = (logs: string[], program: string) =>
  logs.some((l) => l.startsWith(`Program ${program} invoke`));
const failedBy = (logs: string[], program: string) =>
  logs.some((l) => l.startsWith(`Program ${program} failed`));

export async function verifyHookProof(
  raw: unknown,
  rpc: ProofRpc,
  dec: ProofDecoder,
): Promise<HookProof> {
  const parsed = proofInputSchema.safeParse(raw);
  if (!parsed.success)
    return failure(
      "invalid-input",
      "Invalid input. Only devnet, valid addresses and up to 8 signatures are accepted.",
    );
  const inp = parsed.data;
  try {
    if ((await rpc.genesis()) !== PROOF_GENESIS.devnet)
      return failure("wrong-network", "RPC genesis does not match devnet. Refused.");
  } catch {
    return failure("rpc-unavailable", "Solana RPC unavailable. Nothing was verified.");
  }
  const { extraMetas, qliConfig } = rpc.derive(inp.mint, inp.hookProgram);
  const keys = [inp.hookProgram, inp.mint, extraMetas, qliConfig, inp.dbcPool, inp.dammPool].filter(
    (x): x is string => !!x,
  );
  let snap;
  try {
    snap = await rpc.accounts(keys);
  } catch {
    return failure("rpc-unavailable", "Solana RPC unavailable. Nothing was verified.");
  }
  const get = (k: string | undefined) => (k ? (snap.values[keys.indexOf(k)] ?? null) : null);
  const checks: Check[] = [];
  const add = (id: string, label: string, ok: boolean | null, detail: string) =>
    checks.push({
      id,
      label,
      status: ok === null ? "unknown" : ok ? "pass" : "fail",
      detail,
      slot: snap.slot,
    });

  const hp = get(inp.hookProgram);
  add(
    "hook-executable",
    "Hook program exists and is executable",
    !!hp && hp.executable,
    hp ? `owner ${hp.owner}` : "account not found",
  );
  const m = get(inp.mint);
  const mintOk = !!m && m.owner === TOKEN_2022;
  add(
    "mint-token2022",
    "Mint is owned by Token-2022",
    mintOk,
    m ? `owner ${m.owner}` : "account not found",
  );
  const bound = mintOk && mintHookProgram(m!.data) === inp.hookProgram;
  add(
    "mint-hook-bound",
    "Mint TransferHook extension points at this hook program",
    bound,
    mintOk ? `extension program ${mintHookProgram(m!.data) ?? "none"}` : "not a Token-2022 mint",
  );
  const em = get(extraMetas);
  add(
    "extra-metas",
    "ExtraAccountMetaList PDA owned by hook program",
    !!em && em.owner === inp.hookProgram,
    `${extraMetas} ${em ? `owner ${em.owner}` : "missing"}`,
  );
  const cfgAcc = get(qliConfig);
  const cfg = cfgAcc && cfgAcc.owner === inp.hookProgram ? decodeQliConfig(cfgAcc.data) : null;
  const policy: HookProof["policy"] =
    cfg && cfg.mint === inp.mint
      ? {
          layout: "qli-research-v1",
          paused: cfg.paused,
          allowlist: cfg.allowlist,
          allowCount: cfg.allowCount,
        }
      : { layout: "unknown", paused: null, allowlist: null, allowCount: null };
  add(
    "policy-state",
    "Policy state readable (QLi research layout)",
    policy.layout === "qli-research-v1" ? true : null,
    policy.layout === "qli-research-v1"
      ? `paused=${policy.paused} allowlist=${policy.allowlist} entries=${policy.allowCount}`
      : "Not the QLi layout; policy semantics unknown",
  );
  const deployed = checks.slice(0, 4).every((c) => c.status === "pass");

  let poolOk = false;
  let poolMigrated = false;
  if (inp.dbcPool) {
    const p = get(inp.dbcPool);
    const isHookPool =
      !!p && p.owner === DBC_PROGRAM && TRANSFER_HOOK_POOL_DISC.every((b, i) => p.data[i] === b);
    const st = isHookPool ? dec.poolState(p!.data) : null;
    poolOk = !!st && st.baseMint === inp.mint;
    poolMigrated = !!st && st.isMigrated === 1;
    add(
      "dbc-pool",
      "DBC TransferHookPool owned by DBC with this base mint",
      poolOk,
      !p
        ? "account not found"
        : p.owner !== DBC_PROGRAM
          ? "not DBC-owned"
          : !isHookPool
            ? "DBC account is not a TransferHookPool"
            : st
              ? `baseMint ${st.baseMint}, migrated=${st.isMigrated}`
              : "decode failed",
    );
  }
  let dammOk = false;
  if (inp.dammPool) {
    const d = get(inp.dammPool);
    dammOk = !!d && d.owner === DAMM_V2_PROGRAM;
    add(
      "damm-pool",
      "DAMM v2 pool account owned by DAMM v2 program",
      dammOk,
      d ? `owner ${d.owner}` : "account not found",
    );
  }

  const verdicts: TxVerdict[] = [];
  const loaded: { claim: string; tx: ChainTx | null; signature: string }[] = [];
  for (const t of inp.txs) {
    let tx: ChainTx | null = null;
    try {
      tx = await rpc.transaction(t.signature);
    } catch {
      tx = null;
    }
    loaded.push({ claim: t.claim, tx, signature: t.signature });
  }
  let migrationSlot: number | null = null;
  for (const l of loaded.filter((x) => x.claim === "migration")) {
    const tx = l.tx;
    let ok = false;
    let detail = "transaction not found";
    if (tx) {
      const ix = tx.instructions.find(
        (i) => i.programId === DBC_PROGRAM && dec.dbcIxName(i.data) === MIGRATION_IX.name,
      );
      ok =
        !!ix &&
        !tx.err &&
        ix.accounts[MIGRATION_IX.virtualPool] === inp.dbcPool &&
        ix.accounts[MIGRATION_IX.pool] === inp.dammPool &&
        ix.accounts[MIGRATION_IX.baseMint] === inp.mint &&
        poolOk &&
        poolMigrated &&
        dammOk;
      detail = !ix
        ? "no DBC migrationDammV2 instruction"
        : tx.err
          ? "transaction failed"
          : ok
            ? "migrationDammV2 binds this DBC pool, DAMM v2 pool and base mint; pool flag migrated"
            : "instruction accounts or pool state do not match the supplied addresses";
      if (ok) migrationSlot = tx.slot;
    }
    verdicts.push({
      signature: l.signature,
      claim: l.claim,
      status: ok ? "verified" : tx ? "rejected" : "unproven",
      phase: "n/a",
      detail,
      slot: tx?.slot ?? null,
    });
  }
  for (const l of loaded.filter((x) => x.claim !== "migration")) {
    const tx = l.tx;
    if (!tx || !tx.confirmation || !["confirmed", "finalized"].includes(tx.confirmation)) {
      verdicts.push({
        signature: l.signature,
        claim: l.claim,
        status: "unproven",
        phase: "n/a",
        detail: "not found or not confirmed",
        slot: tx?.slot ?? null,
      });
      continue;
    }
    const phase =
      migrationSlot === null
        ? "pre-graduation"
        : tx.slot > migrationSlot
          ? "post-graduation"
          : "pre-graduation";
    const mintIn = tx.accountKeys.includes(inp.mint);
    const hookRan = invoked(tx.logs, inp.hookProgram);
    const t22 = invoked(tx.logs, TOKEN_2022);
    let status: TxVerdict["status"] = "rejected";
    let detail = "";
    if (!mintIn) detail = "transaction does not reference this mint";
    else if (l.claim === "transfer-allow") {
      if (!tx.err && t22 && hookRan) {
        status = "verified";
        detail = "succeeded; Token-2022 invoked the hook";
      } else detail = tx.err ? "transaction failed" : "hook not invoked";
    } else if (l.claim === "transfer-deny") {
      if (tx.err && t22 && hookRan && failedBy(tx.logs, inp.hookProgram)) {
        status = "verified";
        detail = "failed with the hook program reporting failure";
      } else {
        status = "unproven";
        detail = tx.err
          ? "failed, but the failure is not attributed to the hook in logs"
          : "transaction succeeded";
      }
    } else {
      const ix = tx.instructions.find(
        (i) =>
          i.programId === DBC_PROGRAM &&
          dec.dbcIxName(i.data) === SWAP_HOOK_IX &&
          !!inp.dbcPool &&
          i.accounts[SWAP_HOOK_ACCOUNTS.pool] === inp.dbcPool &&
          i.accounts[SWAP_HOOK_ACCOUNTS.baseMint] === inp.mint,
      );
      if (ix && !tx.err && hookRan && poolOk) {
        status = "verified";
        detail = "swap2WithTransferHook on this pool succeeded and the hook ran";
      } else
        detail = !ix
          ? "no swap2WithTransferHook on this pool"
          : tx.err
            ? "swap failed"
            : "hook not invoked or pool unverified";
    }
    verdicts.push({
      signature: l.signature,
      claim: l.claim,
      status,
      phase: l.claim === "dbc-swap" ? "pre-graduation" : phase,
      detail,
      slot: tx.slot,
    });
  }

  const has = (claim: string, phase?: string) =>
    verdicts.some(
      (v) => v.claim === claim && v.status === "verified" && (!phase || v.phase === phase),
    );
  let tier: Tier =
    REPOSITORY_EVIDENCE.localValidatorCpi === "PASSED"
      ? "LOCAL_VALIDATOR_TESTED"
      : REPOSITORY_EVIDENCE.unitTests === "PASSED"
        ? "LOCAL_UNIT_TESTED"
        : "NOT_CONFIGURED";
  if (deployed) tier = "DEVNET_PROGRAM_DEPLOYED";
  const dbc =
    deployed &&
    poolOk &&
    has("dbc-swap") &&
    has("transfer-allow", "pre-graduation") &&
    has("transfer-deny", "pre-graduation");
  if (dbc) tier = "DBC_VERIFIED";
  const mig = dbc && verdicts.some((v) => v.claim === "migration" && v.status === "verified");
  if (mig) tier = "MIGRATION_VERIFIED";
  if (mig && has("transfer-allow", "post-graduation") && has("transfer-deny", "post-graduation"))
    tier = "POST_GRAD_VERIFIED";

  const body = {
    version: HOOK_PROOF_VERSION,
    network: inp.network,
    genesis: PROOF_GENESIS.devnet,
    observedSlot: snap.slot,
    input: inp,
    tier,
    checks,
    txs: verdicts,
    policy,
  };
  return {
    ok: true,
    code: "ok",
    message: deployed
      ? "Checked against server-trusted devnet RPC. Higher tiers require every listed check."
      : "Checked against server-trusted devnet RPC. Deployment checks did not pass; no devnet tier granted.",
    version: HOOK_PROOF_VERSION,
    network: "devnet",
    observedSlot: snap.slot,
    tier,
    checks,
    txs: verdicts,
    policy,
    receipt: {
      digest: await domainHash(HOOK_PROOF_DOMAIN, body),
      integrity: "sha256 integrity checksum, not a signature, attestation or audit",
    },
  };
}
