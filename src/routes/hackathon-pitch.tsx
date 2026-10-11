import { createFileRoute } from "@tanstack/react-router";
import { HackathonPitch } from "@/components/qli/hackathon-pitch";
import { pitchIndex, pitchSlides } from "@/lib/qli/hackathon-pitch";
import { metadata } from "@/lib/qli-core/data";

export const Route = createFileRoute("/hackathon-pitch")({
  validateSearch: (search: Record<string, unknown>) => ({ slide: pitchIndex(search["slide"]) }),
  head: ({ match }) =>
    metadata(
      `Hackathon Pitch · ${match.search.slide}/8 · ${pitchSlides[match.search.slide - 1]?.kicker ?? "Meteora DBC"}`,
      "QuantumQLi’s eight-slide Crypto World’s Fair Meteora DBC technical submission: wallet-controlled execution, verifiable intelligence and honest development evidence.",
    ),
  component: PitchPage,
});
function PitchPage() {
  const { slide } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <HackathonPitch
      slide={slide}
      onSlide={(next) => {
        void navigate({ search: { slide: pitchIndex(next) }, replace: true });
      }}
    />
  );
}