import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0004_harden_model_budget_inputs.sql", "utf8");

describe("durable hosted-call budget hardening", () => {
  it("rejects every nullable input before acquiring the reservation lock", () => {
    for (const input of ["_profile", "_n", "_hourly", "_daily", "_global_daily"]) {
      expect(sql).toContain(`${input} IS NULL`);
    }
    expect(sql.indexOf("_profile IS NULL")).toBeLessThan(sql.indexOf("pg_advisory_xact_lock"));
  });

  it("bounds batch size and every cap independently", () => {
    for (const guard of [
      "_n < 1 OR _n > 18",
      "_hourly < 0 OR _hourly > 100",
      "_daily < 0 OR _daily > 500",
      "_global_daily < 0 OR _global_daily > 5000",
    ]) {
      expect(sql).toContain(guard);
    }
    expect(sql).toContain("IF NOT EXISTS (SELECT 1 FROM public.qli_agent_profiles");
  });

  it("serializes all cap checks and reserves the batch in one transaction", () => {
    const lock = sql.indexOf("pg_advisory_xact_lock");
    const counts = sql.indexOf("SELECT count(*) INTO h");
    const guard = sql.indexOf("IF h + _n > _hourly");
    const insert = sql.indexOf("INSERT INTO public.qli_model_calls");
    expect(lock).toBeLessThan(counts);
    expect(counts).toBeLessThan(guard);
    expect(guard).toBeLessThan(insert);
    expect(sql).toContain("generate_series(1, _n)");
  });

  it("keeps reservation and pruning inaccessible to public callers", () => {
    for (const signature of [
      "qli_reserve_model_calls(uuid, integer, integer, integer, integer)",
      "qli_prune_neural()",
    ]) {
      expect(sql).toContain(
        `REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated`,
      );
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role`);
    }
  });
});
