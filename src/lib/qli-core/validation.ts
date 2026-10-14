import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
function validMint(value: string) {
  try {
    return new PublicKey(value).toBytes().length === 32;
  } catch {
    return false;
  }
}
const uri = z
  .string()
  .trim()
  .max(2048)
  .refine((s) => !s || /^https:\/\/|^ipfs:\/\//.test(s), "Use an HTTPS or IPFS URI.");
const url = z
  .string()
  .trim()
  .max(2048)
  .refine((s) => !s || /^https:\/\//.test(s), "Use an HTTPS URL.");
export const SIGNATURE_SCHEMES = [
  {
    id: "wots",
    label: "Quantum QLi Root · WOTS-16 + Merkle h=8",
    note: "One-time leaf · 2,404 B · reference implementation wired",
    status: "reference",
  },
  {
    id: "ml-dsa-65",
    label: "ML-DSA-65 · FIPS 204",
    note: "Certified by a WOTS leaf before use · production implementation pending",
    status: "pending",
  },
  {
    id: "slh-dsa",
    label: "SLH-DSA-SHA2-128s · FIPS 205",
    note: "Certified by a WOTS leaf before use · production implementation pending",
    status: "pending",
  },
  {
    id: "fn-dsa",
    label: "FN-DSA / Falcon-512",
    note: "Experimental · not a final FIPS standard",
    status: "experimental",
  },
  {
    id: "hybrid",
    label: "Hybrid ed25519 + ML-DSA-65",
    note: "Advanced experimental · production implementation pending",
    status: "experimental",
  },
] as const;
export type SchemeId = (typeof SIGNATURE_SCHEMES)[number]["id"];
export const DAMM_V2_FEE_OPTIONS = [25, 30, 100, 200, 400, 600] as const;
export const launchSchema = z
  .object({
    mode: z.enum(["standard", "quantum"]),
    scheme: z.enum(["wots", "ml-dsa-65", "slh-dsa", "fn-dsa", "hybrid"]),
    image: uri,
    name: z.string().trim().min(1, "Token name is required.").max(32, "Name max 32 characters."),
    symbol: z
      .string()
      .trim()
      .regex(/^[A-Z0-9]{1,10}$/, "Ticker must be 1–10 uppercase letters or digits."),
    description: z.string().trim().max(500, "Description max 500 characters."),
    twitter: z
      .string()
      .trim()
      .max(64)
      .refine(
        (s) => !s || /^@?[A-Za-z0-9_]{1,15}$/.test(s) || /^https:\/\/(x|twitter)\.com\//.test(s),
        "Use an @handle or x.com URL.",
      ),
    website: url,
    telegram: url,
    metadata: uri,
    vanity: z.boolean(),
    vanitySuffix: z
      .string()
      .max(3)
      .regex(/^[1-9A-HJ-NP-Za-km-z]*$/, "Vanity suffix must contain up to 3 base58 characters."),
    launchSlippage: z.coerce.number().positive().max(5),
    prioritySol: z.coerce.number().min(0).max(0.1),
    decimals: z.coerce
      .number()
      .int()
      .min(6, "Base decimals must be 6–9.")
      .max(9, "Base decimals must be 6–9."),
    supply: z.coerce.number().positive("Supply must be positive.").max(1e15),
    tokenType: z.enum(["SPL", "Token-2022"]),
    builder: z.enum(["Market Cap", "Two Segments", "Liquidity Weights", "Custom"]),
    initialCap: z.coerce.number().positive("Initial market cap must be positive."),
    migrationCap: z.coerce.number().positive(),
    quoteThreshold: z.coerce.number().positive("Migration threshold must be positive."),
    supplyMigration: z.coerce.number().min(1).max(100),
    startingBps: z.coerce.number().int().min(0).max(9900),
    endingBps: z.coerce.number().int().min(0).max(9900),
    scheduler: z.enum(["Linear", "Exponential", "Fixed"]),
    dynamic: z.boolean(),
    collectMode: z.enum(["Quote only", "Both tokens"]),
    creatorFee: z.coerce.number().min(0).max(100),
    creationFee: z.coerce.number().min(0).max(100),
    dammFee: z.coerce
      .number()
      .refine(
        (v) => (DAMM_V2_FEE_OPTIONS as readonly number[]).includes(v),
        "Choose a DAMM v2 fee tier.",
      ),
    partnerLiquidity: z.coerce.number().min(0).max(100),
    creatorLiquidity: z.coerce.number().min(0).max(100),
    partnerLocked: z.coerce.number().min(0).max(100),
    creatorLocked: z.coerce.number().min(0).max(100),
    vesting: z.coerce.number().int().min(0).max(3650),
    leftoverReceiver: z.string().trim().max(44),
    quoteKind: z.enum(["crypto", "tokenized"]),
    quote: z.enum(["SOL", "USDC", "Custom"]),
    customMint: z.string().trim().max(44),
    tokenizedMint: z.string().trim().max(44),
    firstBuy: z.enum(["none", "creator", "partner-and-creator"]),
    firstBuyAmount: z.coerce.number().min(0).max(1e9),
  })
  .superRefine((d, ctx) => {
    if (d.migrationCap <= d.initialCap)
      ctx.addIssue({
        code: "custom",
        path: ["migrationCap"],
        message: "Migration market cap must exceed initial market cap.",
      });
    if (d.creatorLiquidity + d.partnerLiquidity !== 100)
      ctx.addIssue({
        code: "custom",
        path: ["creatorLiquidity"],
        message: "Creator and partner liquidity must total 100%.",
      });
    if (d.partnerLocked > d.partnerLiquidity)
      ctx.addIssue({
        code: "custom",
        path: ["partnerLocked"],
        message: "Partner lock cannot exceed the partner share.",
      });
    if (d.creatorLocked > d.creatorLiquidity)
      ctx.addIssue({
        code: "custom",
        path: ["creatorLocked"],
        message: "Creator lock cannot exceed the creator share.",
      });
    if (d.scheduler !== "Fixed" && d.endingBps > d.startingBps)
      ctx.addIssue({
        code: "custom",
        path: ["endingBps"],
        message: "Ending fee cannot exceed starting fee.",
      });
    if (d.leftoverReceiver && !validMint(d.leftoverReceiver))
      ctx.addIssue({
        code: "custom",
        path: ["leftoverReceiver"],
        message: "Leftover receiver must be a valid Solana address.",
      });
    if (d.quoteKind === "crypto" && d.quote === "Custom" && !validMint(d.customMint))
      ctx.addIssue({
        code: "custom",
        path: ["customMint"],
        message: "Enter a valid Solana quote mint.",
      });
    if (d.quoteKind === "tokenized" && !validMint(d.tokenizedMint))
      ctx.addIssue({
        code: "custom",
        path: ["tokenizedMint"],
        message: "Select or enter a valid tokenized market mint.",
      });
    if (d.firstBuy !== "none" && d.firstBuyAmount <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["firstBuyAmount"],
        message: "First buy amount must be positive.",
      });
  });
export type LaunchDraft = z.infer<typeof launchSchema>;
export const STEP_FIELDS: (keyof LaunchDraft)[][] = [
  [
    "image",
    "name",
    "symbol",
    "description",
    "twitter",
    "website",
    "telegram",
    "metadata",
    "decimals",
    "supply",
    "tokenType",
    "vanity",
    "vanitySuffix",
  ],
  ["builder", "initialCap", "migrationCap", "quoteThreshold", "supplyMigration"],
  ["startingBps", "endingBps", "scheduler", "creatorFee", "creationFee", "dammFee"],
  [
    "partnerLiquidity",
    "creatorLiquidity",
    "partnerLocked",
    "creatorLocked",
    "vesting",
    "leftoverReceiver",
  ],
  ["quoteKind", "quote", "customMint", "tokenizedMint"],
  ["firstBuy", "firstBuyAmount", "launchSlippage", "prioritySol"],
];
export function resolveQuoteMint(
  d: Pick<LaunchDraft, "quoteKind" | "quote" | "customMint" | "tokenizedMint">,
) {
  if (d.quoteKind === "tokenized") return d.tokenizedMint;
  return d.quote === "SOL"
    ? "So11111111111111111111111111111111111111112"
    : d.quote === "USDC"
      ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
      : d.customMint;
}
export const strategySchema = z
  .object({
    lower: z.coerce.number().min(0).max(100),
    upper: z.coerce.number().min(0).max(100),
    threshold: z.coerce.number().positive().max(100),
    slippage: z.coerce.number().int().min(1).max(500),
    trade: z.coerce.number().positive().max(10000),
    reserve: z.coerce.number().min(0.01).max(1000),
    cooldown: z.coerce.number().int().min(10).max(86400),
    actions: z.coerce.number().int().min(1).max(60),
    harvest: z.coerce.number().positive().max(10000),
  })
  .refine((v) => v.lower < v.upper, {
    message: "Lower inventory band must be below the upper band.",
    path: ["upper"],
  });
export const rpcSchema = z
  .string()
  .url()
  .max(2048)
  .refine(
    (s) =>
      (() => {
        try {
          const u = new URL(s);
          return (
            !u.username &&
            !u.password &&
            (u.protocol === "https:" || (u.protocol === "http:" && u.hostname === "localhost"))
          );
        } catch {
          return false;
        }
      })(),
    "Use an HTTPS RPC endpoint.",
  );
