import { createServerFn } from "@tanstack/react-start";
import { failure, proofInputSchema, type HookProof } from "./hook-proof";

/** Public read-only Hook Enforcement Proof v2 (devnet only). Never builds or signs a transaction. */
export const verifyHookEnforcement = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => proofInputSchema.parse(d))
  .handler(async ({ data }): Promise<HookProof> => {
    const { getRequestIP, setResponseHeader } = await import("@tanstack/react-start/server");
    const { lifecycleRateLimited } = await import("./lifecycle.server");
    setResponseHeader("cache-control", "no-store");
    if (lifecycleRateLimited(`hookproof:${getRequestIP({ xForwardedFor: true }) ?? "unknown"}`))
      return failure("rate-limited", "Lookup rate limit reached. Try again in a minute.");
    const { runHookProof } = await import("./hook-proof.server");
    return runHookProof(data);
  });
