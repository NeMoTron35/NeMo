import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isSignature, networkSchema, type ProofResult } from "./launch-proof";

/** Public, read-only launch verification against server-trusted RPC endpoints only. */
export const getLaunchProof = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ network: networkSchema, signature: z.string().max(90).refine(isSignature) })
      .strict()
      .parse(d),
  )
  .handler(async ({ data }): Promise<ProofResult> => {
    const { getRequestIP, setResponseHeader } = await import("@tanstack/react-start/server");
    const { lookupLaunchProof, rateLimited } = await import("./launch-proof.server");
    setResponseHeader("cache-control", "no-store");
    const ip = getRequestIP({ xForwardedFor: true }) ?? "unknown";
    if (rateLimited(ip))
      return {
        ok: false,
        code: "rate-limited",
        message: "Too many lookups from this client. Try again in a minute.",
      };
    return lookupLaunchProof(data.network, data.signature);
  });