import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    meta: [
      { title: "Approvals — Newtonite Operations" },
      { name: "description", content: "Work items awaiting team approval." },
    ],
  }),
});
