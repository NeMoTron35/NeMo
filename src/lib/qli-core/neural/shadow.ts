// NEMOTRON3.5 Shadow Engine v4: counterfactual constant-product stress grid. NOT a forecast and NOT DBC curve math.
import { z } from "zod";

export const SHADOW_VERSION = "qli-shadow/4.0.0";
export const MAX_U64 = (1n << 64n) - 1n;
const BPS = 10_000n;

export const shadowConfigSchema = z.object({
  model: z.literal("constant-product-hypothetical"),
  baseReserve: z.string().regex(/^\d{1,20}$/),
  quoteReserve: z.string().regex(/^\d{1,20}$/),
  feeBps: z.number().int().min(0).max(1000),
  maxImpactBps: z.number().int().min(1).max(5000),
  tradeBps: z.array(z.number().int().min(1).max(5000)).min(1).max(5),
  reserveShockBps: z.number().int().min(0).max(9000),
});
export type ShadowConfig = z.infer<typeof shadowConfigSchema>;

/** x*y=k quote->base output with input-side fee, floor division (conservative). */
export function cpOut(xIn: bigint, x: bigint, y: bigint, feeBps: bigint): bigint {
  if (x <= 0n || y <= 0n) throw new Error("Reserves must be positive.");
  if (xIn < 0n) throw new Error("Input must be non-negative.");
  if (feeBps < 0n || feeBps > 1000n) throw new Error("Fee out of bounds.");
  if (x > MAX_U64 || y > MAX_U64 || xIn > MAX_U64) throw new Error("u64 overflow.");
  const inFee = xIn * (BPS - feeBps);
  return (inFee * y) / (x * BPS + inFee);
}

export type Scenario = {
  name: string;
  quoteIn: string;
  baseOut: string;
  impactBps: number;
  violates: boolean;
};

/** Impact vs spot (no-fee marginal price), in bps, computed with integer math. */
function impactBps(xIn: bigint, out: bigint, x: bigint, y: bigint): number {
  if (xIn === 0n) return 0;
  const ideal = (xIn * y) / x;
  if (ideal === 0n) return 10_000;
  return Number(((ideal - out) * BPS) / ideal);
}

export function runShadow(cfg: ShadowConfig) {
  const c = shadowConfigSchema.parse(cfg);
  const x = BigInt(c.quoteReserve),
    y = BigInt(c.baseReserve),
    fee = BigInt(c.feeBps);
  const k0 = x * y;
  const scen = (name: string, qx: bigint, qy: bigint, bps: number): Scenario => {
    const xIn = (qx * BigInt(bps)) / BPS;
    const out = cpOut(xIn, qx, qy, fee);
    if ((qx + xIn) * (qy - out) < qx * qy) throw new Error("Invariant violated.");
    const imp = impactBps(xIn, out, qx, qy);
    return {
      name,
      quoteIn: xIn.toString(),
      baseOut: out.toString(),
      impactBps: imp,
      violates: imp > c.maxImpactBps,
    };
  };
  const scenarios: Scenario[] = c.tradeBps.map((b) =>
    scen(`Trade ${b / 100}% of quote reserve`, x, y, b),
  );
  const sx = (x * (BPS - BigInt(c.reserveShockBps))) / BPS;
  const sy = (y * (BPS - BigInt(c.reserveShockBps))) / BPS;
  if (c.reserveShockBps > 0 && sx > 0n && sy > 0n)
    scenarios.push(
      scen(
        `Liquidity shock −${c.reserveShockBps / 100}% then largest trade`,
        sx,
        sy,
        Math.max(...c.tradeBps),
      ),
    );
  const outs = scenarios.map((s) => BigInt(s.baseOut));
  return {
    version: SHADOW_VERSION,
    label:
      "Counterfactual on hypothetical constant-product reserves. Not a forecast; not Meteora DBC curve math.",
    calibration: "uncalibrated" as const,
    k: k0.toString(),
    scenarios,
    minOut: outs.reduce((a, b) => (b < a ? b : a)).toString(),
    maxOut: outs.reduce((a, b) => (b > a ? b : a)).toString(),
    violations: scenarios.filter((s) => s.violates).length,
    review: scenarios.some((s) => s.violates)
      ? "Owner review suggested: at least one scenario exceeds the impact limit."
      : "No scenario exceeded the impact limit.",
  };
}

/** Observed vs hypothetical: compares consecutive observed quote reserves (real) — no trades are inferred. */
export function observedDrift(history: { slot: string | null; quoteReserve: string | null }[]) {
  const pts = history.filter((h) => h.quoteReserve && /^\d+$/.test(h.quoteReserve));
  if (pts.length < 2) return { status: "insufficient-data" as const, points: pts.length };
  const first = BigInt(pts[pts.length - 1]!.quoteReserve!),
    last = BigInt(pts[0]!.quoteReserve!);
  return {
    status: "observed" as const,
    points: pts.length,
    fromSlot: pts[pts.length - 1]!.slot,
    toSlot: pts[0]!.slot,
    deltaQuote: (last - first).toString(),
  };
}
