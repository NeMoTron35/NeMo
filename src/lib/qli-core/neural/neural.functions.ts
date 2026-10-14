// Neural Engine RPCs. All owner data requires the wallet-signed QLi Agent session token.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const token = z.string().regex(/^[0-9a-f]{64}$/);

export const neStatus = createServerFn({ method: "GET" }).handler(async () =>
  (await import("./neural.server")).neuralStatus(),
);
export const neAnalyze = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token,
        poolId: z.string().uuid(),
        question: z.string().trim().min(3).max(300),
        useModel: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) =>
    (await import("./neural.server")).analyze(
      data.token,
      data.poolId,
      data.question,
      data.useModel,
    ),
  );
export const neShadow = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token,
        poolId: z.string().uuid(),
        baseReserve: z.string().regex(/^\d{1,20}$/),
        feeBps: z.number().int().min(0).max(1000),
        maxImpactBps: z.number().int().min(1).max(5000),
        tradeBps: z.array(z.number().int().min(1).max(5000)).min(1).max(5),
        reserveShockBps: z.number().int().min(0).max(9000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { token: t, poolId, ...cfg } = data;
    return (await import("./neural.server")).shadow(t, poolId, cfg);
  });
export const neGraph = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token }).parse(d))
  .handler(async ({ data }) => (await import("./neural.server")).graph(data.token));
export const neArena = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, confirmCharges: z.literal(true) }).parse(d))
  .handler(async ({ data }) =>
    (await import("./neural.server")).arena(data.token, data.confirmCharges),
  );
