import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/v1/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { cryptoApi } = await import("@/lib/qli/api");
        return cryptoApi(request, params._splat ?? "");
      },
      POST: async ({ request, params }) => {
        const { cryptoApi } = await import("@/lib/qli/api");
        return cryptoApi(request, params._splat ?? "");
      },
      OPTIONS: async ({ request, params }) => {
        const { cryptoApi } = await import("@/lib/qli/api");
        return cryptoApi(request, params._splat ?? "");
      },
    },
  },
});
