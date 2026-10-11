import { createFileRoute } from "@tanstack/react-router";

// Public, read-only status. Returns only enums, numeric caps and allowlisted
// model ids — never token values. No paid inference is performed.
export const Route = createFileRoute("/api/public/neural-status")({
  server: {
    handlers: {
      GET: async () => {
        const headers = {
          "content-type": "application/json",
          "cache-control": "no-store, private",
        };
        try {
          const { neuralStatus } = await import("@/lib/qli-core/neural/neural.server");
          const s = await neuralStatus();
          const body = {
            engine: s.engine,
            hf: s.hf,
            models: s.models,
            caps: s.caps,
            arenaRequests: s.arenaRequests,
          };
          return new Response(JSON.stringify(body), { status: 200, headers });
        } catch {
          return new Response(JSON.stringify({ error: "status_unavailable" }), {
            status: 503,
            headers,
          });
        }
      },
    },
  },
});