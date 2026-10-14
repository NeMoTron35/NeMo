import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isAddress, networkSchema } from "./launch-proof";
import { MESSAGE, type HookInspection } from "./hook-forge";

export const inspectSchema = z
  .object({
    network: networkSchema,
    address: z.string().max(44).refine(isAddress, "Not a valid Solana address."),
    kind: z.enum(["mint", "pool"]),
  })
  .strict();

/** Public read-only Token-2022 TransferHook inspection. Never builds or signs a transaction. */
export const inspectTransferHook = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => inspectSchema.parse(d))
  .handler(async ({ data }): Promise<HookInspection> => {
    const { getRequestIP, setResponseHeader } = await import("@tanstack/react-start/server");
    const { lifecycleRateLimited } = await import("./lifecycle.server");
    setResponseHeader("cache-control", "no-store");
    if (lifecycleRateLimited(`hook:${getRequestIP({ xForwardedFor: true }) ?? "unknown"}`))
      return {
        ok: false,
        code: "rate-limited",
        message: MESSAGE["rate-limited"],
        network: data.network,
        mint: null,
        observedSlot: null,
        tokenProgram: null,
        extensions: [],
        transferHook: null,
        permissions: [],
        risks: [],
        compatibility: {
          dbcSdkPath: "n/a",
          launchForge: "n/a",
          dammV2Migration: "n/a",
          verdict: "not-applicable",
        },
      };
    const { inspectAddress } = await import("./hook-forge.server");
    return inspectAddress(data.network, data.address, data.kind);
  });
