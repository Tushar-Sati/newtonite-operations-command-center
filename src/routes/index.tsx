import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { ActivityPanel, KpiGrid, TeamWorkloadSummary, WorkItemsOverview, WorkloadChart } from "@/components/dashboard/DashboardWidgets";
import { ErrorState, Skeleton } from "@/components/common/States";
import { dashboardQueryOptions, isUsingMockData } from "@/lib/api/dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Newtonite Operations" },
      { name: "description", content: "Operations dashboard: workload, team capacity, approvals and recent activity." },
      { property: "og:title", content: "Dashboard — Newtonite Operations" },
      { property: "og:description", content: "Operations dashboard: workload, team capacity, approvals and recent activity." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQueryOptions),
  pendingComponent: DashboardSkeleton,
  errorComponent: ({ error }) => <DashboardError message={error.message} />,
  component: Dashboard,
});

function Dashboard() {
  const { data } = useSuspenseQuery(dashboardQueryOptions);
  return (
    <div className="space-y-6">
      {isUsingMockData && (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Showing temporary sample data. No backend is connected yet.
        </div>
      )}
      <KpiGrid kpis={data.kpis} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><WorkloadChart data={data.weekly} /></div>
        <TeamWorkloadSummary teams={data.teams} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2"><WorkItemsOverview items={data.workItems} /></div>
        <ActivityPanel events={data.activity} />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

function DashboardError({ message }: { message: string }) {
  const router = useRouter();
  return <ErrorState message={message} onRetry={() => router.invalidate()} />;
}
