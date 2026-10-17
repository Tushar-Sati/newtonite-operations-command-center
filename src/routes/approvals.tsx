import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/layout/ComingSoon";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — Newtonite Operations" },
      { name: "description", content: "Approvals in Newtonite Operations (planned)." },
      { property: "og:title", content: "Approvals — Newtonite Operations" },
      { property: "og:description", content: "Approvals in Newtonite Operations (planned)." },
    ],
  }),
  component: () => <ComingSoon title="Approvals" />,
});
