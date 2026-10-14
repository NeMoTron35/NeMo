// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";
import {
  acceptSlot,
  assertOwnedVault,
  driftFindings,
  monitorAvailability,
  u64String,
} from "@/lib/qli-core/vault-monitor-core";
import { QUANTUM_VAULT_DEPLOYMENT } from "@/lib/qli-core/quantum-vault";

const owner = Keypair.generate().publicKey;
describe("Vault monitoring rules", () => {
  it("is unavailable without a verified deployment", () => {
    expect(QUANTUM_VAULT_DEPLOYMENT).toBeNull();
    expect(monitorAvailability(null).available).toBe(false);
  });
  it("isolates owners and networks", () => {
    expect(() =>
      assertOwnedVault(owner.toBase58(), "devnet", { owner, version: 1 }, 1),
    ).not.toThrow();
    expect(() =>
      assertOwnedVault(Keypair.generate().publicKey.toBase58(), "devnet", { owner, version: 1 }, 1),
    ).toThrow(/owner/);
    expect(() =>
      assertOwnedVault(owner.toBase58(), "mainnet-beta", { owner, version: 1 }, 1),
    ).toThrow(/devnet/);
    expect(() => assertOwnedVault(owner.toBase58(), "devnet", { owner, version: 2 }, 1)).toThrow(
      /version/,
    );
  });
  it("keeps slots monotonic and u64 strings exact", () => {
    expect(acceptSlot(null, 5)).toBe(true);
    expect(acceptSlot(5, 5)).toBe(false);
    expect(acceptSlot(5, 4)).toBe(false);
    expect(u64String((1n << 64n) - 1n)).toBe("18446744073709551615");
    expect(() => u64String(-1n)).toThrow();
  });
  it("flags tampered authority/bytecode/mint as drift", () => {
    const a = {
      program_id: "P",
      program_sha256: "h",
      upgrade_authority: "A",
      mint: "M",
      escrow: "E",
      destination: "D",
      owner: "O",
    };
    expect(driftFindings(a, { ...a })).toEqual([]);
    expect(
      driftFindings(a, { ...a, upgrade_authority: "B", program_sha256: "x", mint: "N" }),
    ).toHaveLength(3);
  });
  it("server monitor never signs or sends and checks session first", () => {
    const src = readFileSync("src/lib/qli-core/vault-monitor.server.ts", "utf8");
    expect(src).not.toMatch(/sendTransaction|sendRawTransaction|signTransaction|Keypair/);
    expect(src.match(/requireSession\(token\)/g)?.length).toBe(3);
    const mig = readFileSync("drizzle/migrations/0001_qli_vault_sentinel.sql", "utf8");
    expect(mig).toMatch(/REVOKE ALL ON public.qli_monitored_vaults.*FROM anon, authenticated/);
    expect(mig).toMatch(/UNIQUE \(vault_id, dedup_key\)/);
  });
});
