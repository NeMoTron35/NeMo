export type Pool = {
  id: string;
  token: string;
  name: string;
  address: string;
  quote: string;
  price: string;
  liquidity: string;
  volume: string;
  fees: string;
  progress: number;
  reserve: number;
  threshold: number;
  status: string;
  points: number[];
};
export const pools: Pool[] = [
  {
    id: "arc",
    token: "ARC",
    name: "Arc Protocol",
    address: "9fQa…7kX2",
    quote: "SOL",
    price: "$0.0842",
    liquidity: "$184,260",
    volume: "$92,481",
    fees: "$462.40",
    progress: 76.8,
    reserve: 614.4,
    threshold: 800,
    status: "Bonding",
    points: [26, 30, 27, 38, 35, 43, 39, 55, 50, 58, 56, 69, 64, 73, 70, 82],
  },
  {
    id: "nexus",
    token: "NXS",
    name: "Nexus Network",
    address: "3nXs…8mP4",
    quote: "USDC",
    price: "$0.0126",
    liquidity: "$128,540",
    volume: "$68,204",
    fees: "$341.02",
    progress: 42.3,
    reserve: 42300,
    threshold: 100000,
    status: "Bonding",
    points: [34, 30, 38, 33, 42, 39, 48, 45, 50, 46, 57, 53, 58, 61, 55, 64],
  },
  {
    id: "vector",
    token: "VEC",
    name: "Vector Labs",
    address: "7vEc…2rT9",
    quote: "SOL",
    price: "$0.0361",
    liquidity: "$111,880",
    volume: "$51,620",
    fees: "$258.10",
    progress: 91.2,
    reserve: 912,
    threshold: 1000,
    status: "Near migration",
    points: [26, 35, 33, 42, 45, 41, 53, 51, 60, 62, 58, 73, 71, 80, 78, 88],
  },
];
export type AuditEvent = {
  id: string;
  time: string;
  type: string;
  severity: "info" | "warning";
  pool: string;
  title: string;
  detail: string;
};
export const initialEvents: AuditEvent[] = [
  {
    id: "e1",
    time: "12:48:32",
    type: "Agent",
    severity: "info",
    pool: "ARC",
    title: "Inventory rebalance simulated",
    detail: "ARC / SOL · 2.40 SOL · Within guardrails",
  },
  {
    id: "e2",
    time: "12:46:18",
    type: "Proof",
    severity: "info",
    pool: "NXS",
    title: "Launch attestation verified · demo",
    detail: "WOTS-16 · Merkle root match · Leaf #042",
  },
  {
    id: "e3",
    time: "12:43:05",
    type: "Fees",
    severity: "info",
    pool: "ARC",
    title: "Fee harvest plan generated",
    detail: "0.182 SOL · Awaiting wallet signature",
  },
  {
    id: "e4",
    time: "12:41:52",
    type: "Migration",
    severity: "warning",
    pool: "VEC",
    title: "Migration threshold approaching",
    detail: "VEC / SOL · 91.2% reserve progress",
  },
  {
    id: "e5",
    time: "12:38:44",
    type: "RPC",
    severity: "info",
    pool: "—",
    title: "Simulation checkpoint completed",
    detail: "12 accounts checked · No transactions submitted",
  },
];
export const consoleNavigation = [
  ["QLi Desk", "/overview"],
  ["QLi Operator", "/agent"],
  ["Liquidity Chambers", "/pools"],
  ["Inventory", "/positions"],
  ["Revenue", "/fees"],
  ["Flywheel", "/flywheel"],
  ["QLi Agent", "/qli-agent"],
  ["Neural Engine", "/neural-engine"],
  ["Creator Studio", "/creator-studio"],
  ["Hook Forge", "/hook-forge"],
  ["Hook Proofs", "/hook-proofs"],
  ["Hook Devnet", "/hook-devnet"],
  ["Event Log", "/audit"],
  ["System", "/settings"],
] as const;
export const productNavigation = [
  ["Launch Forge", "/launch"],
  ["DBC Lifecycle Intelligence", "/meteora-intelligence"],
  ["Quantum Identity", "/identity"],
  ["Quantum Authorization", "/authorization"],
  ["Quantum Vault", "/quantum-vault"],
  ["Identity 2.0 / Experimental", "/identity-v2"],
  ["Quantum Wallets", "/quantum-wallets"],
  ["Proof Inspector", "/verify"],
  ["Docs", "/docs"],
] as const;
/** First-party external profiles. Verified owner-supplied coordinates. */
export const GITHUB_URL = "https://github.com/QuantumQLi";
export const X_URL = "https://x.com/QuantumQLi";
/** Owner-supplied token contract address (mint), shown copyable in the menu bar. */
export const TOKEN_CA = "2LmeQRz6m4dDigmysPQLAstnNBvVoQ9i7m3n5bQLi";
export const METEORA_DBC_URL = "https://docs.meteora.ag/overview/products/dbc/what-is-dbc";
/** All internal routes (console + product). GitHub is external. */
export const publicNavigation = [
  ["Algorithm Atlas", "/markets"],
  ["QLi Desk", "/"],
  ["API Reference", "/api-docs"],
  ["Launch Forge", "/launch"],
  ["Forge Ledger", "/launches"],
  ["Vault Desk", "/vault"],
  ["Market Explorer", "/explore"],
  ["Trade Console", "/terminal"],
  ["Market Pulse", "/trending"],
  ["Wallet Inventory", "/portfolio"],
] as const;
export const navigation = [
  ...publicNavigation,
  ...consoleNavigation,
  ...productNavigation,
  ["White Paper", "/whitepaper"],
  ["My Vaults & Key", "/vaults"],
  ["Deposit", "/deposit"],
  ["Withdraw", "/withdraw"],
  ["Quantum Security", "/security"],
  ["Wallet Events", "/activity"],
] as const;
export function metadata(title: string, description: string) {
  const label = `Quantum QLi — ${title}`;
  return {
    meta: [
      { title: label },
      { name: "description", content: description },
      { property: "og:title", content: label },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
