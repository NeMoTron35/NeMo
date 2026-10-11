// Persisted Vault Sentinel (server-only). Every owner call verifies the wallet-signed session;
// tables are service-role only. Read-only: builds, signs and sends nothing.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSession } from "./agent-v2.server";
import {
  VAULT_INTERVAL_S,
  acceptSlot,
  assertOwnedVault,
  driftFindings,
  monitorAvailability,
  u64String,
  type StoredMonitor,
} from "./vault-monitor-core";

const db = () => supabaseAdmin;
const rpcUrl = () => process.env["QLI_AGENT_RPC_DEVNET"] || "https://api.devnet.solana.com";

async function liveRead(vaultAddr: string) {
  const qv = await import("./quantum-vault");
  const av = monitorAvailability(qv.QUANTUM_VAULT_DEPLOYMENT);
  if (!av.available) throw new Error(av.reason);
  const { Connection, PublicKey } = await import("@solana/web3.js");
  const conn = new Connection(rpcUrl(), "confirmed");
  const idl = new TextEncoder().encode(
    (await import("../../../programs/idl/quantum_vault.json?raw")).default,
  );
  await qv.validateVaultDeployment(conn, av.deployment, idl); // genesis, loader, ProgramData, authority, bytecode
  const vault = new PublicKey(vaultAddr);
  const state = await qv.readVerifiedVault(conn, vault, av.deployment); // owner, PDA, mint, escrow, destination
  const { escrow } = qv.deriveVault(
    new PublicKey(av.deployment.programId),
    state.owner,
    state.mint,
    state.vaultId,
  );
  const [slot, bal] = await Promise.all([
    conn.getSlot("confirmed"),
    conn.getTokenAccountBalance(escrow, "confirmed"),
  ]);
  return {
    d: av.deployment,
    state,
    escrow: escrow.toBase58(),
    slot,
    balance: BigInt(bal.value.amount),
    version: qv.ACCOUNT_VERSION,
  };
}

export async function vaultMonitorState(token: string) {
  const s = await requireSession(token);
  const { QUANTUM_VAULT_DEPLOYMENT } = await import("./quantum-vault");
  const av = monitorAvailability(QUANTUM_VAULT_DEPLOYMENT);
  const { data: profile } = await db()
    .from("qli_agent_profiles")
    .select("id")
    .eq("wallet", s.wallet)
    .eq("network", s.network)
    .maybeSingle();
  if (!profile)
    return { availability: av.available ? "available" : av.reason, vaults: [], alerts: [] };
  const { data: vaults } = await db()
    .from("qli_monitored_vaults")
    .select("id, vault, mint, decimals, active, last_slot, last_observed_at, last_error")
    .eq("profile_id", profile.id);
  const ids = (vaults ?? []).map((v) => v.id);
  const { data: alerts } = ids.length
    ? await db()
        .from("qli_vault_alerts")
        .select("id, vault_id, code, level, detail, slot, created_at")
        .in("vault_id", ids)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] };
  return {
    availability: av.available ? "available" : av.reason,
    vaults: vaults ?? [],
    alerts: alerts ?? [],
  };
}

export async function registerVault(token: string, vaultAddr: string) {
  const s = await requireSession(token);
  const r = await liveRead(vaultAddr);
  assertOwnedVault(s.wallet, s.network, r.state, r.version);
  const { data: profile } = await db()
    .from("qli_agent_profiles")
    .select("id")
    .eq("wallet", s.wallet)
    .eq("network", s.network)
    .maybeSingle();
  if (!profile) throw new Error("Create your agent profile first.");
  const { error } = await db().from("qli_monitored_vaults").insert({
    profile_id: profile.id,
    network: "devnet",
    program_id: r.d.programId,
    program_sha256: r.d.programSha256,
    upgrade_authority: r.d.upgradeAuthority,
    vault: vaultAddr,
    owner: s.wallet,
    mint: r.state.mint.toBase58(),
    escrow: r.escrow,
    destination: r.state.destination.toBase58(),
    account_version: r.state.version,
    decimals: r.state.decimals,
  });
  if (error)
    throw new Error(
      /quota/.test(error.message)
        ? "Vault limit (3) reached."
        : /duplicate/.test(error.message)
          ? "Vault already registered."
          : "Could not register vault.",
    );
}

export async function removeVault(token: string, id: string) {
  const s = await requireSession(token);
  const { data: profile } = await db()
    .from("qli_agent_profiles")
    .select("id")
    .eq("wallet", s.wallet)
    .eq("network", s.network)
    .maybeSingle();
  if (profile)
    await db().from("qli_monitored_vaults").delete().eq("id", id).eq("profile_id", profile.id);
}

/** Scheduled sweep. Inactive (no reads) unless a verified deployment is configured. */
export async function sweepVaults() {
  const { QUANTUM_VAULT_DEPLOYMENT } = await import("./quantum-vault");
  const av = monitorAvailability(QUANTUM_VAULT_DEPLOYMENT);
  if (!av.available) return { vaults: "inactive" as const, checked: 0 };
  const { analyze, dedup } = await import("./vault-sentinel");
  const { data: rows } = await db()
    .from("qli_monitored_vaults")
    .select("*")
    .eq("active", true)
    .lte("next_check_at", new Date().toISOString())
    .limit(20);
  let checked = 0;
  for (const row of rows ?? []) {
    try {
      const r = await liveRead(row.vault);
      const now: StoredMonitor = {
        program_id: r.d.programId,
        program_sha256: r.d.programSha256,
        upgrade_authority: r.d.upgradeAuthority,
        mint: r.state.mint.toBase58(),
        escrow: r.escrow,
        destination: r.state.destination.toBase58(),
        owner: r.state.owner.toBase58(),
      };
      const drift = driftFindings(row as StoredMonitor, now);
      if (acceptSlot(row.last_slot, r.slot)) {
        await db()
          .from("qli_vault_observations")
          .upsert(
            {
              vault_id: row.id,
              slot: r.slot,
              observed_at: new Date().toISOString(),
              escrow_balance: u64String(r.balance),
              window_spent: u64String(r.state.windowSpent),
              nonce: u64String(r.state.nonce),
              epoch: r.state.epoch,
              paused: r.state.paused,
            },
            { onConflict: "vault_id,slot", ignoreDuplicates: true },
          );
        const alerts = analyze(
          null,
          {
            cluster: "devnet",
            vault: row.vault,
            programId: now.program_id,
            programSha256: now.program_sha256,
            upgradeAuthority: now.upgrade_authority,
            state: r.state,
            escrowBalance: r.balance,
            slot: r.slot,
            observedAt: Math.floor(Date.now() / 1000),
          },
          Math.floor(Date.now() / 1000),
        );
        const all = [
          ...alerts,
          ...drift.map((d) => ({
            level: "critical" as const,
            code: "identity-changed" as const,
            detail: d,
            dedupKey: `${row.vault}:drift:${d}`,
          })),
        ];
        for (const a of dedup([], all))
          await db().from("qli_vault_alerts").upsert(
            {
              vault_id: row.id,
              code: a.code,
              level: a.level,
              detail: a.detail,
              slot: r.slot,
              dedup_key: a.dedupKey,
            },
            { onConflict: "vault_id,dedup_key", ignoreDuplicates: true },
          );
      }
      await db()
        .from("qli_monitored_vaults")
        .update({
          last_slot: Math.max(r.slot, row.last_slot ?? 0),
          last_observed_at: new Date().toISOString(),
          last_error: null,
          consecutive_errors: 0,
          next_check_at: new Date(Date.now() + VAULT_INTERVAL_S * 1000).toISOString(),
        })
        .eq("id", row.id);
      checked++;
    } catch {
      const n = row.consecutive_errors + 1;
      await db()
        .from("qli_monitored_vaults")
        .update({
          last_error: "read-failed",
          consecutive_errors: n,
          next_check_at: new Date(Date.now() + Math.min(3600, 60 * 2 ** n) * 1000).toISOString(),
        })
        .eq("id", row.id);
    }
  }
  if (Math.random() < 0.1) await db().rpc("qli_prune_vaults");
  return { vaults: "active" as const, checked };
}