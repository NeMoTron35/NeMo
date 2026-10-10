import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  documentation,
  searchDocumentation,
  articleHeadings,
  parseDocumentation,
  documentationSearch,
} from "@/lib/qli/documentation";
import { DOMAINS } from "@/lib/qli-core/pq";
describe("Quantum QLi first-party documentation", () => {
  it("bundles every required topic from Markdown with unique stable ids", () => {
    expect(documentation.length).toBe(27);
    expect(new Set(documentation.map((d) => d.id)).size).toBe(documentation.length);
    for (const d of documentation) {
      expect(d.body).toContain(`# ${d.title}`);
      expect(d.summary.length).toBeGreaterThan(10);
      expect(d.source).toBe(`docs/${d.id}.md`);
    }
    for (const id of [
      "welcome",
      "quick-start",
      "qli-desk",
      "qli-operator",
      "launch-forge",
      "liquidity-chambers",
      "inventory",
      "revenue",
      "quantum-identity",
      "proof-inspector",
      "event-log",
      "system",
      "public-surfaces",
      "vaults",
      "wallet-flow",
      "solana-meteora",
      "post-quantum",
      "security",
      "public-api",
      "configuration",
      "local-development",
      "deployment",
      "troubleshooting",
      "glossary",
      "architecture",
      "limitations",
    ])
      expect(documentation.some((d) => d.id === id)).toBe(true);
  });
  it("supports full-text search and no-result searches", () => {
    expect(searchDocumentation("blockhash").some((d) => d.id === "wallet-flow")).toBe(true);
    expect(searchDocumentation("Guarded").some((d) => d.id === "qli-operator")).toBe(true);
    expect(searchDocumentation("this-topic-does-not-exist")).toEqual([]);
  });
  it("resolves every documentation deep link and section anchor", () => {
    for (const d of documentation) {
      for (const match of d.body.matchAll(/\]\(\/docs\?article=([a-z-]+)(?:#([a-z-]+))?\)/g)) {
        const target = documentation.find((a) => a.id === match[1]);
        expect(target, `${d.id} -> ${match[1]}`).toBeDefined();
        if (target && match[2])
          expect(articleHeadings(target.body).some((h) => h.id === match[2])).toBe(true);
      }
    }
  });
  it("matches package commands, protocol namespaces and unavailable boundaries", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    const local = documentation.find((d) => d.id === "local-development")?.body ?? "";
    for (const match of local.matchAll(/bun run ([a-z:-]+)/g))
      if (match[1]) expect(scripts[match[1]]).toBeDefined();
    const protocol = documentation.find((d) => d.id === "protocol-reference")?.body ?? "";
    for (const key of Object.keys(DOMAINS)) expect(protocol).toContain(`DOMAINS.${key}`);
    expect(documentation.find((d) => d.id === "quantum-identity")?.body).toContain(
      "signed, not submitted",
    );
    expect(documentation.find((d) => d.id === "launch-forge")?.body).toContain(
      "does **not** commit",
    );
    expect(documentation.find((d) => d.id === "security")?.body).toContain(
      "does not explicitly zero all WOTS buffers",
    );
  });
  it("contains environment names only and stable article search validation", () => {
    const config = documentation.find((d) => d.id === "configuration")?.body ?? "";
    expect(config).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(config).not.toMatch(
      /sb_publishable_|sb_secret_|eyJ[a-zA-Z0-9_-]{20}|SUPABASE_[A-Z_]+\s*=/,
    );
    expect(documentationSearch({ article: "public-api" })).toEqual({ article: "public-api" });
    expect(documentationSearch({ article: 123 })).toEqual({});
  });
  it("rejects source files without required metadata", () => {
    expect(() => parseDocumentation("bad.md", "# Bad")).toThrow(/front matter/);
  });
});
