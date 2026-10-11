// QLi Agent: session-only, read-only observer + deterministic rules + non-executable proposals.
// Nothing in this module builds, signs or sends a transaction. Proposals are typed suggestions
// that the Flywheel page re-validates, re-reads on-chain and rebuilds from scratch.
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { GENESIS, WSOL_MINT } from "./dbc-launch";
import {
  BUYBACK_HARD_MAX_SOL,
  MAX_SLIPPAGE_BPS,
  fromBaseUnits,
  toBaseUnits,
  loadFlywheelPool,
  readFlywheelBalances,
  type FlywheelPool,
  type FlywheelStep,
} from "./flywheel-live";

export type AgentNetwork = "mainnet-beta" | "devnet";
export const AGENT_WARNING =
  "QLi Agent observes live data and prepares proposals. Every transaction requires fresh wallet review/approval. Quantum Authorization is application-enforced, not on-chain protection.";
export const AGENT_RUNTIME_LABEL = "Session-only observer; pauses when browser closes.";
export const AGENT_ANALYSIS_LABEL =
  "Autonomous monitoring / rules-based analysis. Optional AI summaries are not configured.";
export const MAX_AGENT_POOLS = 5;
export const MIN_CADENCE_S = 30;
export const MAX_CADENCE_S = 600;
/** Proposal size ceiling; below the Flywheel hard cap. */
export const AGENT_MAX_PROPOSAL_SOL = 2;
/** A handoff older than this is refused; the Flywheel re-reads anyway. */
export const HANDOFF_MAX_AGE_S = 300;

const base58 = z
  .string()
  .trim()
  .refine((v) => {
    try {
      return new PublicKey(v).toBase58() === v;
    } catch {
      return false;
    }
  }, "Invalid Solana address.");

export const agentProfileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  wallet: base58,
  network: z.enum(["mainnet-beta", "devnet"]),
  genesis: z.string().min(32).max(64),
  identityRoot: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  pools: z.array(base58).min(1).max(MAX_AGENT_POOLS),
  cadenceSeconds: z.number().int().min(MIN_CADENCE_S).max(MAX_CADENCE_S),
  minClaimSol: z.number().min(0).max(1000),
  buybackPct: z.number().int().min(0).max(100),
  maxProposalSol: z.number().gt(0).max(AGENT_MAX_PROPOSAL_SOL),
  slippageBps: z.number().int().min(1).max(MAX_SLIPPAGE_BPS),
  minSolReserve: z.number().min(0).max(100),
  migrationAlertPct: z.number().min(1).max(100),
  staleSeconds: z.number().int().min(30).max(3600),
  proposeBurn: z.boolean(),
});
export type AgentProfile = z.infer<typeof agentProfileSchema>;

export function defaultProfile(wallet: string, network: AgentNetwork): AgentProfile {
  return {
    name: "QLi Agent",
    wallet,
    network,
    genesis: GENESIS[network],
    identityRoot: null,
    pools: [],
    cadenceSeconds: 60,
    minClaimSol: 0.01,
    buybackPct: 50,
    maxProposalSol: 0.5,
    slippageBps: 100,
    minSolReserve: 0.05,
    migrationAlertPct: 85,
    staleSeconds: 180,
    proposeBurn: true,
  };
}

/** Profile is only valid in the exact wallet + network + genesis it was created for. */
export function profileContextIssue(
  p: AgentProfile,
  ctx: { wallet: string | null; network: AgentNetwork },
): string | null {
  if (!ctx.wallet) return "Wallet disconnected. Agent paused.";
  if (ctx.wallet !== p.wallet) return "Connected wallet differs from the agent's wallet. Paused.";
  if (ctx.network !== p.network) return "Network changed since the agent was created. Paused.";
  if (GENESIS[ctx.network] !== p.genesis) return "Genesis mismatch. Paused.";
  return null;
}

export type Observation = {
  pool: string;
  network: AgentNetwork;
  wallet: string;
  creator: string;
  mint: string;
  quoteMint: string;
  quoteIsSol: boolean;
  baseDecimals: number;
  isMigrated: boolean;
  claimableQuote: string; // base units
  claimableBase: string;
  quoteReserve: string | null; // null = unknown from this read
  migrationThreshold: string | null;
  progressPct: number | null;
  walletSol: string;
  walletToken: string;
  supply: string;
  observedAt: number; // unix seconds
  source: string;
};

function bnString(v: unknown): string | null {
  if (v && typeof (v as { toString?: unknown }).toString === "function") {
    const s = String(v);
    return /^\d+$/.test(s) ? s : null;
  }
  return null;
}

/** Pure mapping from verified on-chain reads into an observation; progress only when both known. */
export function toObservation(
  pool: FlywheelPool,
  bal: { solLamports: bigint; tokenBalance: bigint; supply: bigint },
  network: AgentNetwork,
  wallet: string,
  observedAt: number,
): Observation {
  if (pool.creator !== wallet) throw new Error("Wallet is not this pool's creator.");
  const reserve = bnString(
    (pool.virtualPool as unknown as { quoteReserve?: unknown }).quoteReserve,
  );
  const threshold = bnString(
    (pool.poolConfig as unknown as { migrationQuoteThreshold?: unknown }).migrationQuoteThreshold,
  );
  const progress =
    reserve && threshold && BigInt(threshold) > 0n
      ? Math.min(100, Number((BigInt(reserve) * 10000n) / BigInt(threshold)) / 100)
      : null;
  return {
    pool: pool.pool,
    network,
    wallet,
    creator: pool.creator,
    mint: pool.baseMint,
    quoteMint: pool.quoteMint,
    quoteIsSol: pool.quoteMint === WSOL_MINT,
    baseDecimals: pool.baseDecimals,
    isMigrated: pool.isMigrated,
    claimableQuote: pool.creatorQuoteFee,
    claimableBase: pool.creatorBaseFee,
    quoteReserve: reserve,
    migrationThreshold: threshold,
    progressPct: progress,
    walletSol: bal.solLamports.toString(),
    walletToken: bal.tokenBalance.toString(),
    supply: bal.supply.toString(),
    observedAt,
    source: "Meteora DBC virtual pool + config, SPL mint and wallet balances (confirmed)",
  };
}

/** Live read. Throws on wrong creator/network; caller pauses the agent on any error. */
export async function observePool(
  rpc: string,
  pool: string,
  wallet: string,
  network: AgentNetwork,
): Promise<Observation> {
  const p = await loadFlywheelPool(rpc, pool, wallet);
  const bal = await readFlywheelBalances(rpc, p, wallet);
  return toObservation(p, bal, network, wallet, Math.floor(Date.now() / 1000));
}

export type Ability = "Launch Watcher" | "Liquidity Sentinel" | "Flywheel Strategist";
export type Alert = {
  ability: Ability;
  level: "info" | "warning";
  pool: string;
  title: string;
  logic: string;
  observedAt: number;
};
export type Proposal = {
  id: string;
  kind: "qli-agent-proposal";
  v: 1;
  step: FlywheelStep;
  network: AgentNetwork;
  genesis: string;
  wallet: string;
  creator: string;
  pool: string;
  mint: string;
  /** buyback: SOL decimal string; burn: token decimal string; claim: "" */
  amount: string;
  maxSpendSol: string;
  slippageBps: number;
  rationale: string;
  provenance: string;
  observedAt: number;
  createdAt: number;
  status: "open" | "denied" | "handed-off";
};

/** Integer-safe SOL -> lamports (decimal string path; no float multiplication). */
export function lamportsOf(sol: number) {
  if (!Number.isFinite(sol) || sol < 0) return 0n;
  return toBaseUnits(sol.toFixed(9), 9);
}

/** Deterministic rules. Same observation + profile => same output. */
export function evaluateRules(
  obs: Observation,
  p: AgentProfile,
  now: number,
): { alerts: Alert[]; proposals: Omit<Proposal, "id" | "createdAt" | "status">[] } {
  const alerts: Alert[] = [];
  const proposals: Omit<Proposal, "id" | "createdAt" | "status">[] = [];
  const at = obs.observedAt;
  const a = (ability: Ability, level: Alert["level"], title: string, logic: string) =>
    alerts.push({ ability, level, pool: obs.pool, title, logic, observedAt: at });
  if (obs.wallet !== p.wallet || obs.creator !== p.wallet || obs.network !== p.network) {
    a(
      "Launch Watcher",
      "warning",
      "Observation rejected",
      "wallet/creator/network ≠ agent profile",
    );
    return { alerts, proposals };
  }
  if (now - at > p.staleSeconds) {
    a(
      "Launch Watcher",
      "warning",
      "Stale read — no proposals",
      `age ${now - at}s > ${p.staleSeconds}s`,
    );
    return { alerts, proposals };
  }
  // Launch Watcher
  if (obs.isMigrated)
    a("Launch Watcher", "info", "Pool migrated to DAMM v2", "virtualPool.isMigrated ≠ 0");
  // Liquidity Sentinel
  if (obs.progressPct === null)
    a(
      "Liquidity Sentinel",
      "info",
      "Migration progress unknown",
      "quoteReserve or threshold not readable",
    );
  else if (!obs.isMigrated && obs.progressPct >= p.migrationAlertPct)
    a(
      "Liquidity Sentinel",
      "warning",
      `Curve ${obs.progressPct.toFixed(2)}% to migration`,
      `quoteReserve/migrationQuoteThreshold ≥ ${p.migrationAlertPct}%`,
    );
  const reserve = lamportsOf(p.minSolReserve);
  const sol = BigInt(obs.walletSol);
  if (sol < reserve)
    a(
      "Liquidity Sentinel",
      "warning",
      "Wallet SOL below reserve",
      `balance < ${p.minSolReserve} SOL`,
    );
  // Flywheel Strategist
  const common = {
    kind: "qli-agent-proposal" as const,
    v: 1 as const,
    network: obs.network,
    genesis: GENESIS[obs.network],
    wallet: obs.wallet,
    creator: obs.creator,
    pool: obs.pool,
    mint: obs.mint,
    provenance: obs.source,
    observedAt: at,
  };
  const claimable = BigInt(obs.claimableQuote);
  if (claimable > 0n && claimable >= lamportsOf(p.minClaimSol))
    proposals.push({
      ...common,
      step: "claim",
      amount: "",
      maxSpendSol: "",
      slippageBps: 0,
      rationale: `Claimable creator fees ${fromBaseUnits(claimable, 9)} SOL ≥ ${p.minClaimSol} SOL threshold.`,
    });
  if (p.buybackPct > 0 && obs.quoteIsSol && !obs.isMigrated && claimable > 0n) {
    const cap = lamportsOf(
      Math.min(p.maxProposalSol, AGENT_MAX_PROPOSAL_SOL, BUYBACK_HARD_MAX_SOL),
    );
    let amt = (claimable * BigInt(p.buybackPct)) / 100n;
    if (amt > cap) amt = cap;
    const spendable = sol > reserve ? sol - reserve : 0n;
    if (amt > spendable) amt = spendable;
    amt = (amt / 1000n) * 1000n; // round to 1e-6 SOL
    if (amt > 0n)
      proposals.push({
        ...common,
        step: "buyback",
        amount: fromBaseUnits(amt, 9),
        maxSpendSol: fromBaseUnits(amt, 9),
        slippageBps: p.slippageBps,
        rationale: `${p.buybackPct}% of claimable fees, capped at ${p.maxProposalSol} SOL and your ${p.minSolReserve} SOL reserve.`,
      });
  }
  const tok = BigInt(obs.walletToken);
  if (p.proposeBurn && tok > 0n)
    proposals.push({
      ...common,
      step: "burn",
      amount: fromBaseUnits(tok, obs.baseDecimals),
      maxSpendSol: "",
      slippageBps: 0,
      rationale:
        "Wallet holds own-pool tokens (e.g. from a buyback). Burn is permanent — review carefully.",
    });
  return { alerts, proposals };
}

const decimal = z.string().regex(/^(\d{1,12})(\.\d{1,12})?$/);
export const proposalSchema = z
  .object({
    kind: z.literal("qli-agent-proposal"),
    v: z.literal(1),
    id: z.string().min(1).max(64),
    step: z.enum(["claim", "buyback", "burn"]),
    network: z.enum(["mainnet-beta", "devnet"]),
    genesis: z.string(),
    wallet: base58,
    creator: base58,
    pool: base58,
    mint: base58,
    amount: z.union([z.literal(""), decimal]),
    maxSpendSol: z.union([z.literal(""), decimal]),
    slippageBps: z.number().int().min(0).max(MAX_SLIPPAGE_BPS),
    rationale: z.string().max(400),
    provenance: z.string().max(200),
    observedAt: z.number().int(),
    createdAt: z.number().int(),
    status: z.enum(["open", "denied", "handed-off"]),
  })
  .strict();

/** Handoff gate used by the Flywheel. Unknown keys (e.g. signed bytes) are rejected. */
export function validateHandoff(
  raw: unknown,
  ctx: { wallet: string | null; network: AgentNetwork; now: number },
): { ok: true; proposal: Proposal } | { ok: false; error: string } {
  const r = proposalSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: "Malformed agent proposal. Refused." };
  const p = r.data as Proposal;
  if (p.status === "denied") return { ok: false, error: "Proposal was denied." };
  if (!ctx.wallet || ctx.wallet !== p.wallet || p.creator !== p.wallet)
    return { ok: false, error: "Proposal wallet/creator does not match the connected wallet." };
  if (ctx.network !== p.network || GENESIS[ctx.network] !== p.genesis)
    return { ok: false, error: "Proposal network does not match the current network." };
  if (ctx.now - p.observedAt > HANDOFF_MAX_AGE_S)
    return { ok: false, error: "Proposal is based on a stale read. Refresh the agent." };
  if (p.step === "buyback") {
    if (!p.amount || p.slippageBps < 1) return { ok: false, error: "Buyback proposal incomplete." };
    if (Number(p.amount) <= 0 || Number(p.amount) > AGENT_MAX_PROPOSAL_SOL)
      return { ok: false, error: `Buyback must be >0 and ≤ ${AGENT_MAX_PROPOSAL_SOL} SOL.` };
  }
  if (p.step === "burn" && (!p.amount || Number(p.amount) <= 0))
    return { ok: false, error: "Burn proposal amount missing." };
  return { ok: true, proposal: p };
}

/** Untrusted AI summary validator. Output is display text only, never authority. */
const aiSummarySchema = z
  .object({ summary: z.string().min(1).max(600), risks: z.array(z.string().max(160)).max(5) })
  .strict();
export function parseAiSummary(raw: unknown): { summary: string; risks: string[] } | null {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    const r = aiSummarySchema.safeParse(v);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** Polling is allowed only while active, visible, context-valid and error-free. */
export function shouldPoll(s: {
  active: boolean;
  visible: boolean;
  contextIssue: string | null;
  lastError: string | null;
}) {
  return s.active && s.visible && !s.contextIssue && !s.lastError;
}

/** Truthful runtime description; there is no background worker. */
export function runtimeStatus(s: { active: boolean; visible: boolean; paused: string | null }) {
  if (!s.active) return "Paused";
  if (s.paused) return `Paused — ${s.paused}`;
  if (!s.visible) return "Paused — tab hidden";
  return "Observing (this tab only)";
}