import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const Route = createFileRoute("/work-items")({
  head: () => ({
    meta: [
      { title: "Work Items — Newtonite Operations" },
      { name: "description", content: "Work Items in Newtonite Operations (planned)." },
      { property: "og:title", content: "Work Items — Newtonite Operations" },
      { property: "og:description", content: "Work Items in Newtonite Operations (planned)." },
    ],
  }),
  component: () => <ComingSoon title="Work Items" />,
});
