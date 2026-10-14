import { createFileRoute } from "@tanstack/react-router";
import { PageHeading } from "@/components/qli-core/controls";
import { CreatorStudio } from "@/components/qli-core/creator-studio";
import { metadata } from "@/lib/qli-core/data";

function CreatorStudioPage() {
  return (
    <div>
      <PageHeading
        eyebrow="New module · QLi Operator"
        title="Agentic Creator Studio"
        description="Original AI-generated characters, storyboards and draft packs tied to RPC-verified Meteora DBC evidence. Drafting only: nothing signs, posts or moves funds."
      />
      <CreatorStudio />
    </div>
  );
}

export const Route = createFileRoute("/creator-studio")({
  head: () =>
    metadata(
      "Agentic Creator Studio",
      "Create original AI personas, 9:16 storyboards and evidence-labelled draft packs linked to verified Meteora DBC pools.",
    ),
  component: CreatorStudioPage,
});
