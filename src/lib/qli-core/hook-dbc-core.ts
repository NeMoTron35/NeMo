// Browser/SSR-safe pure pieces of the DBC hook path (no SDK / spl-token imports).
import type { Check } from "./hook-devnet";

export type DbcHookForm = {
  name: string;
  symbol: string;
  uri: string;
  totalSupply: number;
  /** In SOL. Kept small for devnet tests; DBC itself validates the resulting curve. */
  initialMarketCap: number;
  migrationMarketCap: number;
  feeBps: number;
};
export const DEFAULT_DBC_FORM: DbcHookForm = {
  name: "QLi Hook Devnet Test",
  symbol: "QLIHT",
  uri: "",
  totalSupply: 1_000_000_000,
  initialMarketCap: 5,
  migrationMarketCap: 20,
  feeBps: 100,
};

export function validateDbcForm(f: DbcHookForm): string[] {
  const e: string[] = [];
  if (!f.name.trim() || new TextEncoder().encode(f.name).length > 32)
    e.push("Name must be 1–32 bytes.");
  if (!/^[A-Z0-9]{1,10}$/.test(f.symbol))
    e.push("Symbol must be 1–10 uppercase letters or digits.");
  // The URI is stored on-chain as text; the console never fetches it (no outbound requests).
  try {
    const u = new URL(f.uri);
    if (u.protocol !== "https:" || f.uri.length > 200)
      e.push("Metadata URI must be an https URL of 200 characters or fewer.");
  } catch {
    e.push("Metadata URI missing: provide an https URL to a metadata JSON you host.");
  }
  if (!Number.isInteger(f.totalSupply) || f.totalSupply < 1_000 || f.totalSupply > 1e12)
    e.push("Total supply must be a whole number between 1,000 and 1,000,000,000,000.");
  if (!(f.initialMarketCap > 0) || !(f.migrationMarketCap > f.initialMarketCap))
    e.push("Migration market cap must be greater than a positive initial market cap.");
  if (f.migrationMarketCap > 200)
    e.push("Devnet test curve: migration market cap must be ≤ 200 SOL.");
  if (!Number.isInteger(f.feeBps) || f.feeBps < 25 || f.feeBps > 1000)
    e.push("Trading fee must be 25–1000 bps.");
  return e;
}

export type DbcPoolStatus = {
  slot: number;
  ok: boolean;
  isTransferHookPool: boolean;
  baseMint: string | null;
  config: string | null;
  quoteReserve: string | null;
  migrationQuoteThreshold: string | null;
  isMigrated: boolean | null;
  migrationFeeOption: number | null;
  /** SDK DAMM_V2_MIGRATION_FEE_ADDRESS[migrationFeeOption], when known. */
  dammConfig: string | null;
  checks: Check[];
};

export type MigrationReadiness = {
  ready: boolean;
  reasons: string[];
  dammConfig: string | null;
  slot: number;
};
export function migrationReadiness(st: DbcPoolStatus): MigrationReadiness {
  const reasons: string[] = [];
  if (!st.ok) reasons.push("Pool, config, mint hook and QLi policy must all verify first.");
  if (st.isMigrated) reasons.push("Already migrated.");
  const t = st.migrationQuoteThreshold ? BigInt(st.migrationQuoteThreshold) : null;
  const q = st.quoteReserve ? BigInt(st.quoteReserve) : null;
  if (t === null || q === null) reasons.push("Threshold or reserve unreadable.");
  else if (q < t) reasons.push(`Curve not complete: ${q} of ${t} lamports of quote reserve.`);
  const damm = st.dammConfig;
  if (!damm) reasons.push("No DAMM v2 config for this migration fee option.");
  return { ready: reasons.length === 0, reasons, dammConfig: damm, slot: st.slot };
}