import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/teams")({
  head: () => ({
    meta: [
      { title: "Teams — Newtonite Operations" },
      { name: "description", content: "Teams you belong to in Newtonite Operations." },
    ],
  }),
});
