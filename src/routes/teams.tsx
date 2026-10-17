import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const Route = createFileRoute("/teams")({
  head: () => ({
    meta: [
      { title: "Teams — Newtonite Operations" },
      { name: "description", content: "Teams in Newtonite Operations (planned)." },
      { property: "og:title", content: "Teams — Newtonite Operations" },
      { property: "og:description", content: "Teams in Newtonite Operations (planned)." },
    ],
  }),
  component: () => <ComingSoon title="Teams" />,
});
