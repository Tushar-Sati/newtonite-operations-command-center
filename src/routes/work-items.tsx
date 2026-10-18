import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/work-items")({
  head: () => ({
    meta: [
      { title: "Work Items — Newtonite Operations" },
      { name: "description", content: "Team work items in Newtonite Operations." },
    ],
  }),
});
