// QLi Agent v2 pure helpers: wallet sign-in message, signature verification, dedup keys,
// worker health and server RPC allowlist. No I/O, no secrets; safe for browser, server and tests.
import { ed25519 } from "@noble/curves/ed25519";
import { PublicKey } from "@solana/web3.js";
import { GENESIS } from "./dbc-launch";

export type V2Network = "mainnet-beta" | "devnet";
export const V2_LEGEND =
  "QLi Agent continuously monitors only when verified server worker is healthy. It never moves funds. Every transaction requires fresh wallet approval. Quantum Authorization remains application-level, not on-chain enforcement.";
export const CHALLENGE_TTL_S = 300;
export const SESSION_TTL_S = 60 * 60 * 4;
export const WORKER_INTERVAL_S = 300;
export const MAX_CHALLENGES_PER_10M = 8;
export const CHALLENGE_PREFIX = "Quantum QLi Agent sign-in";

export function buildChallengeMessage(p: {
  domain: string;
  wallet: string;
  network: V2Network;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}) {
  return [
    `${p.domain} wants you to sign in with your Solana account:`,
    p.wallet,
    "",
    `${CHALLENGE_PREFIX}. Read-only monitoring access. This signature authorizes no transaction and moves no funds.`,
    "",
    `URI: https://${p.domain}`,
    "Version: 1",
    `Chain ID: solana:${p.network}`,
    `Genesis: ${GENESIS[p.network]}`,
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt}`,
    `Expiration Time: ${p.expiresAt}`,
  ].join("\n");
}

export function isValidDomain(d: string) {
  return /^[a-z0-9.-]{1,253}(:\d{1,5})?$/i.test(d);
}

export function isBase58Address(v: string) {
  try {
    return new PublicKey(v).toBase58() === v;
  } catch {
    return false;
  }
}

/** ed25519 verification of the exact challenge bytes by the claimed wallet key. */
export function verifyWalletSignature(message: string, signatureB64: string, wallet: string) {
  try {
    const pub = new PublicKey(wallet).toBytes();
    if (pub.length !== 32) return false;
    const sig = Uint8Array.from(atob(signatureB64), (ch) => ch.charCodeAt(0));
    if (sig.length !== 64) return false;
    return ed25519.verify(sig, new TextEncoder().encode(message), pub);
  } catch {
    return false;
  }
}

/** Cooldown bucket: the same rule on the same pool persists at most once per window. */
export function dedupKey(rule: string, observedAtSec: number, cooldownSec: number) {
  const w = Math.max(60, Math.floor(cooldownSec));
  return `${rule}:${Math.floor(observedAtSec / w)}`;
}

/** Exponential backoff with bounded jitter for per-pool retries (seconds). */
export function backoffSeconds(consecutiveErrors: number, rand = Math.random()) {
  const base = Math.min(3600, WORKER_INTERVAL_S * 2 ** Math.min(consecutiveErrors, 4));
  return Math.round(base + base * 0.2 * rand);
}

export type WorkerHealth = { state: "verified" | "stale" | "inactive"; label: string };
/** Always-on is claimed only when the scheduler exists AND a recent run succeeded. */
export function workerHealth(p: {
  schedulerActive: boolean;
  lastOkAt: number | null;
  now: number;
}): WorkerHealth {
  if (!p.schedulerActive)
    return {
      state: "inactive",
      label: "Scheduler inactive — no background monitoring. Session-only observer.",
    };
  if (p.lastOkAt === null || p.now - p.lastOkAt > WORKER_INTERVAL_S * 3)
    return {
      state: "stale",
      label: "Scheduler configured but no recent successful worker run. Not verified always-on.",
    };
  return { state: "verified", label: "Verified server worker healthy (scheduled every 5 min)." };
}

const PUBLIC_RPC: Record<V2Network, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
};
const ALLOWED_RPC_HOST =
  /^(api\.(mainnet-beta|devnet)\.solana\.com|[a-z0-9-]+\.helius-rpc\.com|[a-z0-9-]+\.quiknode\.pro|[a-z0-9.-]+\.rpcpool\.com)$/;
/** Server-managed RPC only; user input never selects the worker endpoint (no SSRF). */
export function resolveServerRpc(network: V2Network, configured: string | undefined) {
  if (configured) {
    try {
      const u = new URL(configured);
      if (u.protocol === "https:" && ALLOWED_RPC_HOST.test(u.hostname))
        return { url: configured, provider: `server-configured (${u.hostname})` };
    } catch {
      /* fall through */
    }
  }
  return {
    url: PUBLIC_RPC[network],
    provider: `solana-public (${new URL(PUBLIC_RPC[network]).hostname})`,
  };
}

export async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const settingsDefaults = {
  minClaimSol: 0.01,
  buybackPct: 50,
  maxProposalSol: 0.5,
  slippageBps: 100,
  minSolReserve: 0.05,
  migrationAlertPct: 85,
  proposeBurn: true,
  cooldownHours: 6,
};
export type V2Settings = typeof settingsDefaults;
