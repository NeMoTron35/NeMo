import { createFileRoute } from "@tanstack/react-router";
// Scheduler entrypoint. Caller must present the worker token held only in the backend database.
export const Route = createFileRoute("/api/public/qli-agent/worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const w = await import("@/lib/qli-core/agent-worker.server");
        if (!(await w.authorizeWorker(request)))
          return new Response("Unauthorized", { status: 401 });
        const result = await w.runWorker();
        // Vault sweep is a separate, independently reported stage; inactive without a verified deployment.
        const vaults = await (
          await import("@/lib/qli-core/vault-monitor.server")
        )
          .sweepVaults()
          .catch(() => ({ vaults: "failed" as const, checked: 0 }));
        return Response.json(
          { ...result, vaultSweep: vaults },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
