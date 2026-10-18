import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Newtonite Operations" },
      { name: "description", content: "Team activity history in Newtonite Operations." },
    ],
  }),
});
