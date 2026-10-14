import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};
function json(body: unknown, status = 200, cacheSeconds = 0) {
  const text = JSON.stringify(body);
  return new Response(
    text.length > 200_000 ? JSON.stringify({ error: "RESPONSE_TOO_LARGE" }) : text,
    {
      status: text.length > 200_000 ? 500 : status,
      headers: {
        ...CORS,
        "content-type": "application/json; charset=utf-8",
        "cache-control": cacheSeconds ? `public, max-age=${cacheSeconds}` : "no-store",
        "x-qli-api-version": "meteora/v1",
      },
    },
  );
}

/** Read-only public Meteora DBC pool snapshot, optional SDK quote and bounded timeline. */
export const Route = createFileRoute("/api/public/meteora/v1/pools/$network/$pool")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request, params }) => {
        const {
          lookupSchema,
          quoteSchema,
          timelineSchema,
          INTEL_FAIL_TEXT,
          LIFECYCLE_VERSION,
          SNAPSHOT_DOMAIN,
        } = await import("@/lib/qli-core/lifecycle");
        const base = lookupSchema.safeParse({ network: params.network, pool: params.pool });
        if (!base.success)
          return json(
            { error: "VALIDATION_ERROR", message: INTEL_FAIL_TEXT["invalid-input"] },
            400,
          );
        const url = new URL(request.url);
        const allowed = new Set([
          "amountIn",
          "direction",
          "slippageBps",
          "timeline",
          "limit",
          "before",
        ]);
        for (const k of url.searchParams.keys())
          if (!allowed.has(k))
            return json(
              { error: "VALIDATION_ERROR", message: `Unknown query parameter: ${k.slice(0, 32)}` },
              400,
            );
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown";
        const srv = await import("@/lib/qli-core/lifecycle.server");
        if (srv.lifecycleRateLimited(`api:${ip}`))
          return json(
            {
              error: "RATE_LIMITED",
              message: "Best-effort per-isolate limit reached; retry in a minute.",
            },
            429,
          );
        const { network, pool } = base.data;
        const snap = await srv.intelligence(network, pool);
        if (!snap.ok)
          return json(
            { error: snap.code.toUpperCase().replace(/-/g, "_"), message: snap.message },
            snap.code === "rate-limited"
              ? 429
              : snap.code === "rpc-unavailable"
                ? 503
                : snap.code === "not-found"
                  ? 404
                  : 422,
          );
        let quote: unknown = null;
        if (url.searchParams.has("amountIn")) {
          const q = quoteSchema.safeParse({
            network,
            pool,
            direction: url.searchParams.get("direction") ?? "buy",
            amountIn: url.searchParams.get("amountIn"),
            slippageBps: Number(url.searchParams.get("slippageBps") ?? "100"),
          });
          if (!q.success)
            return json(
              {
                error: "VALIDATION_ERROR",
                message: q.error.issues[0]?.message ?? "Invalid quote parameters.",
              },
              400,
            );
          quote = await srv.quote(q.data);
        }
        let timeline: unknown = null;
        if (url.searchParams.get("timeline") === "1") {
          const t = timelineSchema.safeParse({
            network,
            pool,
            limit: Number(url.searchParams.get("limit") ?? "20"),
            before: url.searchParams.get("before") ?? undefined,
          });
          if (!t.success)
            return json(
              { error: "VALIDATION_ERROR", message: "Invalid timeline parameters." },
              400,
            );
          timeline = (await srv.timeline(network, pool, t.data.limit, t.data.before)) ?? {
            unavailable: true,
            note: "Timeline could not be read; nothing is inferred.",
          };
        }
        return json(
          {
            apiVersion: "meteora/v1",
            lifecycleVersion: LIFECYCLE_VERSION,
            digest: {
              algorithm: "sha256",
              domain: SNAPSHOT_DOMAIN,
              value: snap.digest,
              scope: "snapshot",
              note: "Tamper-evident checksum, not a signature.",
            },
            snapshot: snap.snapshot,
            quote,
            timeline,
            disclaimer:
              "Read-only observation. Quotes are estimates, not guaranteed outcomes. No transaction is built or signed.",
          },
          200,
          quote || timeline ? 0 : 10,
        );
      },
    },
  },
});
