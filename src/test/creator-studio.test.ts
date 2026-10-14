import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canTransition,
  draftPack,
  evidenceCards,
  groundedAnswer,
  packContentSchema,
  personaSchema,
  provenanceHash,
  scanClaims,
  scanText,
} from "@/lib/qli-core/creator-studio";
import type { Snapshot } from "@/lib/qli-core/lifecycle";

const snap = {
  network: "devnet",
  pool: "GgCerxvd5myhq8ifQqFZqSacnHwemByjdkczUftDm5Qj",
  programId: "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
  genesisVerified: true,
  observedSlot: 123,
  observedAt: new Date().toISOString(),
  stage: "trading",
  progressPpm: 250000,
  facts: {
    baseMint: "Mint1111111111111111111111111111111",
    creator: "C".repeat(32),
    quoteReserve: "500",
  },
  config: { migrationQuoteThreshold: "2000" },
  fees: { unclaimed: { creatorQuote: "7" } },
  provenance: { rpc: "server-devnet", evidence: {} },
} as unknown as Snapshot;
const persona = {
  name: "Nova Relay",
  handle: "nova_relay",
  personality: "Curious archivist",
  aesthetic: "cobalt glass",
  voice: "calm",
  bible: "An original character.",
  avatarRef: "monogram" as const,
  pool: null,
  poolNetwork: null,
};

describe("creator studio safety", () => {
  it("rejects links, secrets, emails and impersonation", () => {
    expect(scanText("see https://evil.example")).toContain("url");
    expect(scanText(`[${Array(64).fill(1).join(",")}]`)).toContain("secret");
    expect(scanText("token hf_abcdefghijklmnopqrstuvwxyz")).toContain("secret");
    expect(scanText("mail me a@b.co")).toContain("email");
    expect(scanText("official account of a celebrity")).toContain("impersonation");
    expect(personaSchema.safeParse({ ...persona, bible: "www.x.com" }).success).toBe(false);
    expect(personaSchema.safeParse(persona).success).toBe(true);
  });
  it("sanitizes markup and rejects bad handles", () => {
    const r = personaSchema.parse({ ...persona, name: "<script>Nova</script>" });
    expect(r.name).not.toMatch(/[<>]/);
    expect(personaSchema.safeParse({ ...persona, handle: "Bad Handle" }).success).toBe(false);
  });
});

describe("evidence and claims", () => {
  it("creates no cards without verified snapshot (no fabrication)", () => {
    expect(evidenceCards(null, null)).toEqual([]);
    expect(
      evidenceCards({ ...snap, genesisVerified: false } as unknown as Snapshot, "a".repeat(64)),
    ).toEqual([]);
  });
  it("traces every card to network, slot, rpc and digest", () => {
    const cards = evidenceCards(snap, "d".repeat(64));
    expect(cards.length).toBeGreaterThan(5);
    for (const c of cards) {
      expect(["confirmed", "derived"]).toContain(c.kind);
      expect(c.trace).toMatchObject({ network: "devnet", slot: 123, digest: "d".repeat(64) });
    }
  });
  it("draft without pool makes no on-chain statements and is never verified", () => {
    const p = draftPack("launch-pack", persona, null);
    expect(packContentSchema.safeParse(p).success).toBe(true);
    const f = scanClaims([p.script], []);
    expect(f.some((x) => x.verdict === "supported")).toBe(false);
  });
  it("flags promotional and unsupported factual claims", () => {
    const f = scanClaims(["This is guaranteed 100x. The pool migrated yesterday."], []);
    expect(f.map((x) => x.verdict)).toEqual(["promotional", "unsupported-fact"]);
  });
  it("grounded answers refuse financial advice and need evidence", () => {
    expect(groundedAnswer("Should I buy now?", snap).grounded).toBe(false);
    expect(groundedAnswer("When does it migrate?", null).grounded).toBe(false);
    expect(groundedAnswer("What is migration progress?", snap)).toMatchObject({ grounded: true });
  });
  it("provenance hash is deterministic and changes on edit", async () => {
    const cards = evidenceCards(snap, "d".repeat(64));
    const p = draftPack("weekly-update", persona, snap);
    const a = await provenanceHash(p, cards);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await provenanceHash(p, cards)).toBe(a);
    expect(await provenanceHash({ ...p, script: p.script + "x" }, cards)).not.toBe(a);
  });
  it("status transitions are constrained", () => {
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("review", "approved")).toBe(true);
    expect(canTransition("approved", "ready")).toBe(true);
  });
});

describe("creator studio boundaries", () => {
  const files = [
    "src/components/qli-core/creator-studio.tsx",
    "src/lib/qli-core/creator-studio.ts",
    "src/lib/qli-core/creator-studio.server.ts",
  ].map((f) => readFileSync(f, "utf8"));
  it("never signs or sends transactions, or posts socially", () => {
    for (const s of files) {
      expect(s).not.toMatch(/signTransaction|sendTransaction|sendRawTransaction|signAndSend/);
      expect(s).not.toMatch(/api\.twitter|api\.x\.com|fetch\(/);
    }
  });
  it("server scopes every owner query by session wallet", () => {
    const s = files[2]!;
    expect(s).toMatch(/requireSession/);
    expect((s.match(/\.from\("qli_creator_/g) ?? []).length).toBeLessThanOrEqual(
      (s.match(/owner_wallet|scope\(/g) ?? []).length,
    );
  });
  it("every update/delete is network-scoped and checked for failure or zero rows", () => {
    const s = files[2]!;
    const writes = s.match(/\.(update|delete)\([^]*?;/g) ?? [];
    expect(writes.length).toBeGreaterThanOrEqual(6);
    for (const w of writes) {
      expect(w).toMatch(/\.eq\("owner_wallet", o\.wallet\)/);
      expect(w).toMatch(/\.eq\("network", o\.network\)/);
      expect(w).toMatch(/\.select\("id"\)/);
    }
    expect(s).toMatch(/Creator Studio storage is unavailable/);
  });
  it("tables are service-role only", () => {
    const sql = readFileSync("drizzle/migrations/0006_qli_creator_studio.sql", "utf8");
    expect(sql).toMatch(/REVOKE ALL ON public\.qli_creator_personas.*FROM anon, authenticated/);
    expect(sql).not.toMatch(/TO anon|TO authenticated/);
  });
});
