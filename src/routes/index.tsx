import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ActivityPanel, KpiGrid, TeamWorkloadSummary, WorkItemsOverview, WorkloadChart } from "@/components/dashboard/DashboardWidgets";
import { ErrorState, Skeleton } from "@/components/common/States";
import { dashboardQueryOptions } from "@/lib/api/dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Newtonite Operations" },
      { name: "description", content: "Operations dashboard: workload, team capacity, approvals and recent activity." },
      { property: "og:title", content: "Dashboard — Newtonite Operations" },
      { property: "og:description", content: "Operations dashboard: workload, team capacity, approvals and recent activity." },
    ],
  }),
  pendingComponent: DashboardSkeleton,
  errorComponent: ({ error }) => <DashboardError message={error instanceof Error ? error.message : "Unknown error"} />,
  component: Dashboard,
});

function Dashboard() {
  const { data, isPending, error, refetch } = useQuery(dashboardQueryOptions);
  if (isPending) return <DashboardSkeleton />;
  if (error || !data) return <ErrorState message={error instanceof Error ? error.message : "Dashboard data is unavailable."} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-6">
      <KpiGrid kpis={data.kpis} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2"><WorkloadChart data={data.weekly} /></div>
        <ActivityPanel events={data.activity} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <TeamWorkloadSummary teams={data.teams} />
        <div className="min-w-0 xl:col-span-2"><WorkItemsOverview items={data.workItems} /></div>
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
