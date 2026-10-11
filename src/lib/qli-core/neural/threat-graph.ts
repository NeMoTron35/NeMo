// QLi Threat Graph v4.5: owner-scoped relationship graph built only from server-verified registered rows.
// Signals describe patterns with uncertainty. They never label people and never block addresses.

export const GRAPH_VERSION = "qli-threat-graph/4.5.0";

export type NodeKind = "owner" | "pool" | "mint" | "vault" | "program";
export type GNode = { id: string; kind: NodeKind; label: string };
export type GEdge = {
  from: string;
  to: string;
  rel: string;
  source: string;
  slot: string | null;
  observedAt: string | null;
};
export type Signal = {
  code: string;
  severity: "info" | "notice";
  confidence: "low" | "medium";
  detail: string;
  nodes: string[];
};

export type PoolRow = {
  id: string;
  pool: string;
  creator: string;
  base_mint: string;
  quote_mint: string;
  last_slot: number | null;
  last_observed_at: string | null;
  consecutive_errors: number;
  network: string;
};
export type VaultRow = {
  id: string;
  vault: string;
  owner: string;
  mint: string;
  program_id: string;
  program_sha256: string;
  upgrade_authority: string | null;
  last_slot: number | null;
  last_observed_at: string | null;
};

const WSOL = "So11111111111111111111111111111111111111112";
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function buildGraph(owner: string, network: string, pools: PoolRow[], vaults: VaultRow[]) {
  const nodes = new Map<string, GNode>();
  const edges = new Map<string, GEdge>();
  const node = (id: string, kind: NodeKind, label = short(id)) => {
    if (!nodes.has(`${kind}:${id}`))
      nodes.set(`${kind}:${id}`, { id: `${kind}:${id}`, kind, label });
    return `${kind}:${id}`;
  };
  const edge = (e: GEdge) => {
    const k = `${e.from}|${e.rel}|${e.to}`;
    if (!edges.has(k)) edges.set(k, e);
  };
  const o = node(owner, "owner", "Your wallet");
  const signals: Signal[] = [];
  for (const p of pools.filter((p) => p.network === network)) {
    const pn = node(p.pool, "pool"),
      slot = p.last_slot?.toString() ?? null;
    edge({
      from: o,
      to: pn,
      rel: p.creator === owner ? "created (verified at registration)" : "registered",
      source: "qli_monitored_pools",
      slot,
      observedAt: p.last_observed_at,
    });
    edge({
      from: pn,
      to: node(p.base_mint, "mint"),
      rel: "base mint",
      source: "qli_monitored_pools",
      slot,
      observedAt: p.last_observed_at,
    });
    edge({
      from: pn,
      to: node(p.quote_mint, "mint", p.quote_mint === WSOL ? "wSOL" : short(p.quote_mint)),
      rel: "quote mint",
      source: "qli_monitored_pools",
      slot,
      observedAt: p.last_observed_at,
    });
    if (p.creator !== owner)
      signals.push({
        code: "creator-mismatch",
        severity: "notice",
        confidence: "medium",
        detail:
          "Registered pool creator differs from the signed-in wallet. Re-verify registration.",
        nodes: [pn],
      });
    if (p.consecutive_errors >= 3)
      signals.push({
        code: "read-failures",
        severity: "notice",
        confidence: "medium",
        detail: `${p.consecutive_errors} consecutive failed reads; data may be stale.`,
        nodes: [pn],
      });
    if (!p.last_observed_at)
      signals.push({
        code: "never-observed",
        severity: "info",
        confidence: "low",
        detail: "No verified observation yet.",
        nodes: [pn],
      });
  }
  const byMint = new Map<string, string[]>();
  for (const p of pools.filter((p) => p.network === network))
    byMint.set(p.base_mint, [...(byMint.get(p.base_mint) ?? []), `pool:${p.pool}`]);
  for (const [m, ps] of byMint)
    if (ps.length > 1)
      signals.push({
        code: "shared-base-mint",
        severity: "info",
        confidence: "low",
        detail: `${ps.length} registered pools share one base mint. This is a pattern, not wrongdoing.`,
        nodes: [`mint:${m}`, ...ps],
      });
  const shas = new Set<string>();
  for (const v of vaults) {
    const vn = node(v.vault, "vault"),
      slot = v.last_slot?.toString() ?? null;
    edge({
      from: o,
      to: vn,
      rel: "owns (on-chain owner field)",
      source: "qli_monitored_vaults",
      slot,
      observedAt: v.last_observed_at,
    });
    edge({
      from: vn,
      to: node(v.program_id, "program"),
      rel: "owned by program",
      source: "qli_monitored_vaults",
      slot,
      observedAt: v.last_observed_at,
    });
    edge({
      from: vn,
      to: node(v.mint, "mint"),
      rel: "escrow mint",
      source: "qli_monitored_vaults",
      slot,
      observedAt: v.last_observed_at,
    });
    shas.add(v.program_sha256);
    if (v.upgrade_authority)
      signals.push({
        code: "upgradeable-program",
        severity: "info",
        confidence: "medium",
        detail: "Program upgrade authority is retained; code can be replaced by that authority.",
        nodes: [`program:${v.program_id}`],
      });
  }
  if (shas.size > 1)
    signals.push({
      code: "program-hash-divergence",
      severity: "notice",
      confidence: "medium",
      detail: "Registered vaults attested different program hashes.",
      nodes: vaults.map((v) => `vault:${v.vault}`),
    });
  return {
    version: GRAPH_VERSION,
    network,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    signals,
    scope:
      "Only relationships recorded at verified registration. No external discovery, no identity inference, no blocking.",
  };
}
