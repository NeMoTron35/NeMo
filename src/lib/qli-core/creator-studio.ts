// Agentic Creator Studio pure core. Browser-safe: no network, no wallet, no secrets.
// Creative copy is always class "creative"; only RPC-verified snapshot fields become "confirmed".
import { z } from "zod";
import type { Snapshot } from "./lifecycle";

export const CREATOR_VERSION = "qli-creator-v1";
export const PROVENANCE_DOMAIN = "QLI_CREATOR_MEDIA_PROVENANCE_V1";
export const AI_DISCLOSURE = "AI-generated character";
export const PACK_STATUSES = ["draft", "review", "approved", "ready", "archived"] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];
const NEXT: Record<PackStatus, PackStatus[]> = {
  draft: ["review", "archived"],
  review: ["draft", "approved", "archived"],
  approved: ["ready", "draft", "archived"],
  ready: ["draft", "archived"],
  archived: ["draft"],
};
export const canTransition = (from: PackStatus, to: PackStatus) => NEXT[from].includes(to);

// ---- Safety filters -------------------------------------------------------------------------
const URL_RE = /\b(?:https?:\/\/|www\.|ftp:\/\/|file:\/\/|data:)\S*/i;
const SECRET_RES = [
  /\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/, // base58 64-byte secret key
  /\[\s*\d{1,3}(?:\s*,\s*\d{1,3}){31,}\s*\]/, // JSON byte-array keypair
  /\b(?:[a-z]{3,8}\s+){11}[a-z]{3,8}\b/i, // 12+ word mnemonic shape
  /\b(?:hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.)/,
  /\b(?:private key|seed phrase|secret key|mnemonic|password)\s*[:=]/i,
];
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const IMPERSONATION_RE =
  /\b(?:official account of|i am (?:elon|vitalik|anatoly)|real person|impersonat|parody of a real)\b/i;

export type SafetyIssue = "url" | "secret" | "email" | "impersonation";
export function scanText(s: string): SafetyIssue[] {
  const out: SafetyIssue[] = [];
  if (URL_RE.test(s)) out.push("url");
  if (SECRET_RES.some((r) => r.test(s))) out.push("secret");
  if (EMAIL_RE.test(s)) out.push("email");
  if (IMPERSONATION_RE.test(s)) out.push("impersonation");
  return out;
}
export const SAFETY_TEXT: Record<SafetyIssue, string> = {
  url: "Links are not accepted in creator drafts (prevents outbound fetches and phishing copy).",
  secret: "Text looks like a key, seed phrase or token. Never paste secrets here.",
  email: "Email addresses are not stored in creator drafts.",
  impersonation: "Personas must be original; impersonating real people is refused.",
};
/** Strip control chars and HTML angle brackets; collapse whitespace. */
export function sanitize(s: string, max: number): string {
  return (
    s
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
      .replace(/[<>]/g, "")
      .slice(0, max)
      .trim()
  );
}
const safeStr = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => sanitize(s, max))
    .refine((s) => scanText(s).length === 0, {
      message: "Unsafe content (link, secret, email or impersonation).",
    });

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const networkSchema = z.enum(["mainnet-beta", "devnet"]);
export const personaSchema = z
  .object({
    name: safeStr(40).refine((s) => s.length > 0, "Name required."),
    handle: z
      .string()
      .regex(/^[a-z0-9_]{3,24}$/, "Handle: 3-24 lowercase letters, digits, underscore."),
    personality: safeStr(400),
    aesthetic: safeStr(300),
    voice: safeStr(300),
    bible: safeStr(2000),
    avatarRef: z.enum(["hero", "monogram"]).default("monogram"),
    pool: z.string().regex(BASE58).nullable(),
    poolNetwork: networkSchema.nullable(),
  })
  .strict();
export type PersonaInput = z.infer<typeof personaSchema>;

export const shotSchema = z.object({
  t: z.number().min(0).max(120),
  dur: z.number().min(0.5).max(20),
  text: safeStr(140),
  visual: safeStr(160),
  evidenceRef: z.string().max(40).nullable(),
});
export const packContentSchema = z
  .object({
    script: safeStr(3000),
    shots: z.array(shotSchema).max(24),
    captions: z.array(safeStr(280)).max(6),
    xPosts: z.array(safeStr(280)).max(6),
    checklist: z.array(z.object({ item: safeStr(120), done: z.boolean() })).max(12),
  })
  .strict();
export type PackContent = z.infer<typeof packContentSchema>;
export const questionSchema = safeStr(280).refine((s) => s.length >= 5, "Question too short.");

// ---- Deterministic persona preview --------------------------------------------------------
function fnv(s: string) {
  let h = 0x811c9dc5;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}
/** Palette anchored in the Aqua/cobalt/magenta brand range, varied by handle. Template-derived. */
export function personaTheme(handle: string) {
  const h = fnv(handle || "qli");
  const hue = 190 + (h % 50); // cyan to cobalt
  const accent = 290 + ((h >>> 8) % 40); // purple to magenta
  return {
    source: "template" as const,
    primary: `hsl(${hue} 85% 52%)`,
    secondary: `hsl(${hue + 20} 60% 30%)`,
    accent: `hsl(${accent} 70% 58%)`,
    monogram: (handle || "q").slice(0, 2).toUpperCase(),
  };
}

// ---- Evidence cards -------------------------------------------------------------------------
export type EvidenceKind = "confirmed" | "derived" | "estimate" | "creative";
export type EvidenceCard = {
  id: string;
  kind: EvidenceKind;
  label: string;
  value: string;
  trace: { network: string; slot: number; rpc: string; program: string; digest: string } | null;
};
/** Cards only from a verified snapshot. No snapshot -> no cards (never fabricated). */
export function evidenceCards(s: Snapshot | null, digest: string | null): EvidenceCard[] {
  if (!s || !digest || s.genesisVerified !== true) return [];
  const trace = {
    network: s.network,
    slot: s.observedSlot,
    rpc: s.provenance.rpc,
    program: s.programId,
    digest,
  };
  const c: EvidenceCard[] = [
    {
      id: "E-pool",
      kind: "confirmed",
      label: "DBC pool account (program-owned)",
      value: s.pool,
      trace,
    },
    { id: "E-mint", kind: "confirmed", label: "Base mint", value: s.facts.baseMint, trace },
    { id: "E-creator", kind: "confirmed", label: "Pool creator", value: s.facts.creator, trace },
    {
      id: "E-reserve",
      kind: "confirmed",
      label: "Quote reserve (atomic)",
      value: s.facts.quoteReserve,
      trace,
    },
    {
      id: "E-threshold",
      kind: "confirmed",
      label: "Migration threshold (atomic)",
      value: s.config.migrationQuoteThreshold,
      trace,
    },
    {
      id: "E-fees",
      kind: "confirmed",
      label: "Unclaimed creator quote fees (atomic)",
      value: s.fees.unclaimed.creatorQuote,
      trace,
    },
    { id: "D-stage", kind: "derived", label: "Lifecycle stage", value: s.stage, trace },
  ];
  if (s.progressPpm !== null)
    c.push({
      id: "D-progress",
      kind: "derived",
      label: "Progress to migration threshold",
      value: `${(s.progressPpm / 10_000).toFixed(2)}%`,
      trace,
    });
  return c;
}

// ---- Claim scanner ---------------------------------------------------------------------------
const PROMO_RE =
  /\b(guarantee\w*|moon\w*|100x|10x|risk[- ]free|can'?t lose|profit\w*|returns?|price will|to the moon|financial advice|buy now|pump\w*)\b/i;
const FACT_RE = /\b(reserve|threshold|migrat\w*|graduat\w*|fees?|slot|verified|on-chain|pool)\b/i;
export type ClaimFinding = {
  text: string;
  verdict: "supported" | "unsupported-fact" | "promotional" | "creative";
};
export function scanClaims(texts: string[], cards: EvidenceCard[]): ClaimFinding[] {
  const values = cards.map((c) => c.value);
  return texts.flatMap((t) =>
    t
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
      .map((sentence): ClaimFinding => {
        if (PROMO_RE.test(sentence)) return { text: sentence, verdict: "promotional" };
        if (FACT_RE.test(sentence))
          return {
            text: sentence,
            verdict:
              cards.length &&
              (values.some((v) => sentence.includes(v)) || /\[E-|\[D-/.test(sentence))
                ? "supported"
                : "unsupported-fact",
          };
        return { text: sentence, verdict: "creative" };
      }),
  );
}

// ---- Deterministic draft generation ---------------------------------------------------------
export type PersonaLike = Pick<PersonaInput, "name" | "handle" | "voice" | "aesthetic">;
export type WorkflowKind = "launch-pack" | "weekly-update";
export function draftPack(kind: WorkflowKind, p: PersonaLike, s: Snapshot | null): PackContent {
  const name = p.name || p.handle;
  const stage = s ? s.stage.replace(/-/g, " ") : null;
  const progress = s?.progressPpm != null ? `${(s.progressPpm / 10_000).toFixed(2)}%` : null;
  const factLine = s
    ? `On-chain at slot ${s.observedSlot}: the pool is in stage "${stage}" [D-stage]${progress ? `, ${progress} of its migration threshold [D-progress]` : ""}.`
    : "No verified pool evidence is attached, so this draft makes no on-chain statements.";
  const intro =
    kind === "launch-pack"
      ? `${name} introduces a new chapter on Meteora DBC.`
      : `${name} with this week's pool notes.`;
  const shots = [
    {
      t: 0,
      dur: 3,
      text: intro,
      visual: `Title card, ${p.aesthetic || "cobalt and magenta glow"}`,
      evidenceRef: null,
    },
    {
      t: 3,
      dur: 4,
      text: `${AI_DISCLOSURE}. Story first, facts labelled.`,
      visual: "Avatar close-up with disclosure bar",
      evidenceRef: null,
    },
    {
      t: 7,
      dur: 5,
      text: factLine,
      visual: "Evidence card overlay with slot and network",
      evidenceRef: s ? "D-stage" : null,
    },
    {
      t: 12,
      dur: 4,
      text: "Check the public proof yourself before acting. Not financial advice.",
      visual: "Proof page frame",
      evidenceRef: null,
    },
    {
      t: 16,
      dur: 3,
      text: `Follow ${name} for the next chapter.`,
      visual: "End card with handle",
      evidenceRef: null,
    },
  ];
  return {
    script: [
      intro,
      `Voice: ${p.voice || "calm and precise"}.`,
      factLine,
      "Everything else in this piece is creative fiction from an AI-generated character.",
    ].join("\n\n"),
    shots,
    captions: [`${intro} ${AI_DISCLOSURE}.`, `${factLine} Verify on the public proof page.`],
    xPosts: [
      `${intro} ${factLine} ${AI_DISCLOSURE}. Not financial advice.`.slice(0, 280),
      `${name} weekly note: facts are labelled with evidence IDs; story is fiction. ${AI_DISCLOSURE}.`.slice(
        0,
        280,
      ),
    ],
    checklist: [
      { item: "AI-generated character disclosure visible", done: true },
      { item: "Every on-chain statement carries an evidence ID", done: !!s },
      { item: "No price predictions or return promises", done: true },
      { item: "Owner reviewed final copy", done: false },
      { item: "Publish manually outside QuantumQLi", done: false },
    ],
  };
}

/** Grounded FAQ answers from verified state only; otherwise an honest refusal. */
export function groundedAnswer(
  question: string,
  s: Snapshot | null,
): { answer: string; grounded: boolean } {
  const q = question.toLowerCase();
  if (PROMO_RE.test(q) || /\b(should i buy|sell|invest|price)\b/.test(q))
    return {
      answer: "This board does not give price, trading or investment opinions.",
      grounded: false,
    };
  if (!s)
    return {
      answer: "No verified pool evidence is attached; the owner must answer manually.",
      grounded: false,
    };
  if (/migrat|graduat|threshold|progress/.test(q))
    return {
      answer: `At slot ${s.observedSlot}, stage is "${s.stage}"${s.progressPpm != null ? ` and the quote reserve is ${(s.progressPpm / 10_000).toFixed(2)}% of the migration threshold` : ""}.`,
      grounded: true,
    };
  if (/fee/.test(q))
    return {
      answer: `At slot ${s.observedSlot}, unclaimed creator quote fees are ${s.fees.unclaimed.creatorQuote} atomic units.`,
      grounded: true,
    };
  if (/mint|token|address|contract/.test(q))
    return {
      answer: `The pool's base mint read on-chain at slot ${s.observedSlot} is ${s.facts.baseMint}.`,
      grounded: true,
    };
  return {
    answer: "No grounded answer from pool state; the owner must answer manually.",
    grounded: false,
  };
}

// ---- Provenance ----------------------------------------------------------------------------
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}
/** Integrity checksum over content + evidence classes. Not a signature or on-chain attestation. */
export async function provenanceHash(content: PackContent, cards: EvidenceCard[]): Promise<string> {
  const body = canonical({
    v: CREATOR_VERSION,
    content,
    evidence: cards.map((c) => ({ id: c.id, kind: c.kind, value: c.value, trace: c.trace })),
    creativeClass: "creative",
  });
  const d = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${PROVENANCE_DOMAIN}\n${body}`),
  );
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type WorkflowStep = {
  name: string;
  status: "ok" | "failed" | "skipped";
  detail: string;
  at: string;
};
export const WORKFLOW_STEPS = [
  "Refresh pool evidence",
  "Draft persona story",
  "Scan claims",
  "Queue for approval",
] as const;
