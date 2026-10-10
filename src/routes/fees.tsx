import { createFileRoute } from "@tanstack/react-router";
import { FeesPage } from "@/components/qli-core/markets";
import { metadata } from "@/lib/qli-core/data";
export const Route = createFileRoute("/fees")({
  head: () =>
    metadata("Revenue", "Review partner and creator fee accrual and unsigned claim plans."),
  component: FeesPage,
});
