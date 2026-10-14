import { createServerFn } from "@tanstack/react-start";
import {
  lookupSchema,
  quoteSchema,
  timelineSchema,
  type IntelResult,
  type QuoteResult,
  type Timeline,
} from "./lifecycle";

async function guard() {
  const { getRequestIP, setResponseHeader } = await import("@tanstack/react-start/server");
  const { lifecycleRateLimited } = await import("./lifecycle.server");
  setResponseHeader("cache-control", "no-store");
  return lifecycleRateLimited(getRequestIP({ xForwardedFor: true }) ?? "unknown");
}
const limited = {
  ok: false as const,
  code: "rate-limited" as const,
  message: "Too many lookups from this client. Try again in a minute.",
};

/** Public read-only pool snapshot from server-trusted RPC. */
export const getPoolIntelligence = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => lookupSchema.parse(d))
  .handler(async ({ data }): Promise<IntelResult> => {
    if (await guard()) return limited;
    const { intelligence } = await import("./lifecycle.server");
    return intelligence(data.network, data.pool);
  });

/** Public SDK exact-in quote estimate. Never builds a transaction. */
export const getPoolQuote = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => quoteSchema.parse(d))
  .handler(async ({ data }): Promise<QuoteResult | Exclude<IntelResult, { ok: true }>> => {
    if (await guard()) return limited;
    const { quote } = await import("./lifecycle.server");
    return quote(data);
  });

/** Public bounded lifecycle timeline. */
export const getPoolTimeline = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => timelineSchema.parse(d))
  .handler(async ({ data }): Promise<Timeline | null> => {
    if (await guard()) return null;
    const { timeline } = await import("./lifecycle.server");
    return timeline(data.network, data.pool, data.limit, data.before);
  });
