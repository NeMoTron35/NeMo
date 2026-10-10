export type DocumentationArticle = {
  id: string;
  title: string;
  group: string;
  summary: string;
  body: string;
  source: string;
};
export function parseDocumentation(source: string, raw: string): DocumentationArticle {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match?.[1]) throw new Error(`Documentation front matter missing: ${source}`);
  const metadata = Object.fromEntries(
    match[1].split(/\r?\n/).map((line) => {
      const colon = line.indexOf(":");
      return [line.slice(0, colon), line.slice(colon + 1).trim()];
    }),
  );
  function required(field: string): string {
    const value = metadata[field];
    if (!value) throw new Error(`Documentation ${field} missing: ${source}`);
    return value;
  }
  return {
    id: required("id"),
    title: required("title"),
    group: required("group"),
    summary: required("summary"),
    body: raw.slice(match[0].length).trim(),
    source,
  };
}
const sources = import.meta.glob("/docs/[a-z]*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const order = [
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
  "protocol-reference",
];
export const documentation = Object.entries(sources)
  .map(([path, raw]) => parseDocumentation(path.slice(1), raw))
  .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
export function searchDocumentation(query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return documentation.filter((a) =>
    words.every((w) => `${a.title} ${a.summary} ${a.body}`.toLowerCase().includes(w)),
  );
}
export function headingId(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}
export function articleHeadings(body: string) {
  return [...body.matchAll(/^## (.+)$/gm)].flatMap((m) =>
    m[1] ? [{ title: m[1], id: headingId(m[1]) }] : [],
  );
}
export function documentationSearch(search: Record<string, unknown>): { article?: string } {
  return typeof search["article"] === "string" ? { article: search["article"] } : {};
}