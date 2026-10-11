import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/network-test")({
  beforeLoad: () => {
    throw redirect({ to: "/network-lab", statusCode: 301 });
  },
});