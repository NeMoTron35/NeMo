// QLi Agent v2 server-only logic. Every owner operation first verifies a wallet-signed session
// and scopes every query by that session's wallet + network. Tables are service-role only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CHALLENGE_TTL_S,
  MAX_CHALLENGES_PER_10M,
  SESSION_TTL_S,
  buildChallengeMessage,
  isBase58Address,
  isValidDomain,
  resolveServerRpc,
  settingsDefaults,
  sha256Hex,
  verifyWalletSignature,
  workerHealth,
  type V2Network,
  type V2Settings,
} from "./agent-v2-core";

const db = () => supabaseAdmin;
function randomHex(bytes: number) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function rpcFor(network: V2Network) {
  return resolveServerRpc(
    network,
    network === "mainnet-beta"
      ? process.env["QLI_AGENT_RPC_MAINNET"]
      : process.env["QLI_AGENT_RPC_DEVNET"],
  );
}

export async function createChallenge(wallet: string, network: V2Network, domain: string) {
  if (!isBase58Address(wallet)) throw new Error("Invalid wallet address.");
  if (!isValidDomain(domain)) throw new Error("Invalid request origin.");
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await db()
    .from("qli_wallet_nonces")
    .select("id", { count: "exact", head: true })
    .eq("wallet", wallet)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_CHALLENGES_PER_10M)
    throw new Error("Too many sign-in attempts. Wait a few minutes.");
  const nonce = randomHex(16);
  const issued = new Date();
  const expires = new Date(issued.getTime() + CHALLENGE_TTL_S * 1000);
  const message = buildChallengeMessage({
    domain,
    wallet,
    network,
    nonce,
    issuedAt: issued.toISOString(),
    expiresAt: expires.toISOString(),
  });
  const { error } = await db()
    .from("qli_wallet_nonces")
    .insert({ wallet, network, nonce, message, expires_at: expires.toISOString() });
  if (error) throw new Error("Could not create challenge.");
  return { nonce, message, expiresAt: expires.toISOString() };
}

export async function verifyChallenge(
  wallet: string,
  nonce: string,
  signatureB64: string,
  domain: string,
) {
  // Single-use: atomically mark the nonce used; a replay finds no unused row.
  const { data: row } = await db()
    .from("qli_wallet_nonces")
    .update({ used_at: new Date().toISOString() })
    .eq("nonce", nonce)
    .eq("wallet", wallet)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("wallet, network, message")
    .maybeSingle();
  if (!row) throw new Error("Challenge expired, already used or unknown. Sign in again.");
  if (!row.message.startsWith(`${domain} wants you`))
    throw new Error("Challenge was issued for a different site.");
  if (!verifyWalletSignature(row.message, signatureB64, wallet))
    throw new Error("Wallet signature did not verify.");
  const token = randomHex(32);
  const expires = new Date(Date.now() + SESSION_TTL_S * 1000).toISOString();
  const { error } = await db()
    .from("qli_wallet_sessions")
    .insert({
      wallet,
      network: row.network,
      token_hash: await sha256Hex(token),
      expires_at: expires,
    });
  if (error) throw new Error("Could not create session.");
  return { token, wallet, network: row.network as V2Network, expiresAt: expires };
}

export async function requireSession(token: string) {
  if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("Not signed in.");
  const { data } = await db()
    .from("qli_wallet_sessions")
    .select("id, wallet, network, expires_at, revoked_at")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (!data || data.revoked_at || Date.parse(data.expires_at) < Date.now())
    throw new Error("Session expired. Sign in with your wallet again.");
  return { sessionId: data.id, wallet: data.wallet, network: data.network as V2Network };
}

export async function signOut(token: string) {
  const s = await requireSession(token);
  await db()
    .from("qli_wallet_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", s.sessionId);
}

async function ownProfile(wallet: string, network: V2Network) {
  const { data } = await db()
    .from("qli_agent_profiles")
    .select("*")
    .eq("wallet", wallet)
    .eq("network", network)
    .maybeSingle();
  return data;
}

export async function getState(token: string) {
  const s = await requireSession(token);
  const profile = await ownProfile(s.wallet, s.network);
  const [{ data: sched }, { data: lastOk }, { data: lastRun }] = await Promise.all([
    db().rpc("qli_scheduler_active"),
    db()
      .from("qli_worker_runs")
      .select("finished_at")
      .in("status", ["ok", "partial"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db()
      .from("qli_worker_runs")
      .select("started_at, finished_at, status, pools_checked, errors, note")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const health = workerHealth({
    schedulerActive: !!sched,
    lastOkAt: lastOk?.finished_at ? Math.floor(Date.parse(lastOk.finished_at) / 1000) : null,
    now: Math.floor(Date.now() / 1000),
  });
  if (!profile)
    return {
      session: s,
      profile: null,
      pools: [],
      alerts: [],
      proposals: [],
      observations: [],
      health,
      lastRun,
    };
  const { data: pools } = await db()
    .from("qli_monitored_pools")
    .select(
      "id, pool, network, creator, base_mint, quote_mint, active, last_observed_at, last_slot, last_error, consecutive_errors, next_check_at",
    )
    .eq("profile_id", profile.id)
    .order("created_at");
  const ids = (pools ?? []).map((p) => p.id);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const [alerts, proposals, observations] = await Promise.all([
    db()
      .from("qli_alerts")
      .select("*")
      .in("pool_id", ids.length ? ids : none)
      .order("created_at", { ascending: false })
      .limit(100),
    db()
      .from("qli_proposals")
      .select("*")
      .in("pool_id", ids.length ? ids : none)
      .order("created_at", { ascending: false })
      .limit(50),
    db()
      .from("qli_observations")
      .select("*")
      .in("pool_id", ids.length ? ids : none)
      .order("observed_at", { ascending: false })
      .limit(60),
  ]);
  return {
    session: s,
    profile: {
      id: profile.id,
      name: profile.name,
      active: profile.active,
      hostedInferenceEnabled: profile.hosted_inference_enabled,
      identityRoot: profile.identity_root,
      settings: { ...settingsDefaults, ...(profile.settings as Partial<V2Settings>) },
    },
    pools: pools ?? [],
    alerts: alerts.data ?? [],
    proposals: proposals.data ?? [],
    observations: observations.data ?? [],
    health,
    lastRun,
  };
}

export async function saveProfile(
  token: string,
  p: { name: string; active: boolean; identityRoot: string | null; settings: V2Settings },
) {
  const s = await requireSession(token);
  const { error } = await db().from("qli_agent_profiles").upsert(
    {
      wallet: s.wallet,
      network: s.network,
      name: p.name,
      active: p.active,
      identity_root: p.identityRoot,
      settings: p.settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "wallet,network" },
  );
  if (error) throw new Error("Could not save profile.");
}

export async function deleteProfile(token: string) {
  const s = await requireSession(token);
  await db().from("qli_agent_profiles").delete().eq("wallet", s.wallet).eq("network", s.network);
}

/** The authenticated wallet controls only its own analysis spending consent. No fund authority. */
export async function setHostedConsent(token: string, enabled: boolean) {
  const s = await requireSession(token);
  const { data, error } = await db()
    .from("qli_agent_profiles")
    .update({ hosted_inference_enabled: enabled })
    .eq("wallet", s.wallet)
    .eq("network", s.network)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("Could not update hosted inference consent.");
}

/** Registration verifies on-chain, server-side, that the session wallet created the pool. */
export async function registerPool(token: string, pool: string) {
  const s = await requireSession(token);
  if (!isBase58Address(pool)) throw new Error("Invalid pool address.");
  const profile = await ownProfile(s.wallet, s.network);
  if (!profile) throw new Error("Create your agent profile first.");
  const rpc = rpcFor(s.network);
  const { Connection } = await import("@solana/web3.js");
  const { GENESIS } = await import("./dbc-launch");
  const conn = new Connection(rpc.url, "confirmed");
  if ((await conn.getGenesisHash()) !== GENESIS[s.network])
    throw new Error("Server RPC genesis mismatch. Registration refused.");
  const { loadFlywheelPool } = await import("./flywheel-live");
  const fp = await loadFlywheelPool(rpc.url, pool, s.wallet); // throws unless creator matches
  const { error } = await db().from("qli_monitored_pools").insert({
    profile_id: profile.id,
    pool,
    network: s.network,
    creator: fp.creator,
    base_mint: fp.baseMint,
    quote_mint: fp.quoteMint,
  });
  if (error)
    throw new Error(
      /quota/.test(error.message)
        ? "Pool limit (5) reached."
        : /duplicate/.test(error.message)
          ? "Pool already registered."
          : "Could not register pool.",
    );
}

export async function removePool(token: string, poolId: string) {
  const s = await requireSession(token);
  const profile = await ownProfile(s.wallet, s.network);
  if (!profile) return;
  await db().from("qli_monitored_pools").delete().eq("id", poolId).eq("profile_id", profile.id);
}

export async function setProposalStatus(
  token: string,
  id: string,
  status: "denied" | "handed-off",
) {
  const s = await requireSession(token);
  const profile = await ownProfile(s.wallet, s.network);
  if (!profile) throw new Error("No profile.");
  const { data: pools } = await db()
    .from("qli_monitored_pools")
    .select("id")
    .eq("profile_id", profile.id);
  const ids = (pools ?? []).map((p) => p.id);
  if (!ids.length) throw new Error("Not found.");
  await db()
    .from("qli_proposals")
    .update({ status })
    .eq("id", id)
    .in("pool_id", ids)
    .eq("status", "open");
}
