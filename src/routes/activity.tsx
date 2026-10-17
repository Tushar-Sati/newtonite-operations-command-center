import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Newtonite Operations" },
      { name: "description", content: "Activity in Newtonite Operations (planned)." },
      { property: "og:title", content: "Activity — Newtonite Operations" },
      { property: "og:description", content: "Activity in Newtonite Operations (planned)." },
    ],
  }),
  component: () => <ComingSoon title="Activity" />,
});
