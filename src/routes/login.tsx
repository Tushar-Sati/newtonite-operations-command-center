import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Newtonite Operations" }] }),
});
