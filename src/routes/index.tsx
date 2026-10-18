import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  pendingComponent: () => (
    <div role="status" aria-label="Loading dashboard" className="space-y-6 p-1">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-border/60 bg-card/60"
          />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-80 animate-pulse rounded-xl border border-border/60 bg-card/60 lg:col-span-2" />
        <div className="h-80 animate-pulse rounded-xl border border-border/60 bg-card/60" />
      </div>
    </div>
  ),
  head: () => ({
    meta: [
      { title: "Operations Command Center — Newtonite Operations" },
      {
        name: "description",
        content:
          "See active work, overdue risk, approval decisions, team workload and recent operational changes.",
      },
      { property: "og:title", content: "Operations Command Center — Newtonite Operations" },
      {
        property: "og:description",
        content:
          "See active work, overdue risk, approval decisions, team workload and recent operational changes.",
      },
    ],
  }),
});
