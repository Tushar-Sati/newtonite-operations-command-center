import { useEffect, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardBody, CardHeader } from "@/components/common/Card";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { ApiError } from "@/lib/api/client";
import { PageIntro } from "@/components/common/PageIntro";
import { teamMembersQueryOptions, teamsQueryOptions } from "@/lib/api/resources";
import { dashboardQueryOptions } from "@/lib/api/dashboard";
import { workItemsBoardQueryOptions } from "@/lib/api/work-items";
import { WorkloadChart } from "@/components/dashboard/DashboardWidgets";

export const Route = createFileRoute("/teams")({
  head: () => ({ meta: [{ title: "Teams — Newtonite Operations" }, { name: "description", content: "Teams you belong to in Newtonite Operations." }] }),
  component: TeamsPage,
});

export function TeamsPage() {
  const teamsQuery = useQuery(teamsQueryOptions());
  const dashboard = useQuery(dashboardQueryOptions);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  useEffect(() => {
    const teams = teamsQuery.data ?? [];
    const firstTeamId = teams[0]?.id;
    if (!selectedTeamId && firstTeamId) setSelectedTeamId(firstTeamId);
    if (selectedTeamId && firstTeamId && !teams.some((team) => team.id === selectedTeamId)) setSelectedTeamId(firstTeamId);
  }, [teamsQuery.data, selectedTeamId]);
  const membersQuery = useQuery(teamMembersQueryOptions(selectedTeamId));
  const workloadQueries = useQueries({ queries: (teamsQuery.data ?? []).map((team) => workItemsBoardQueryOptions(team.id, 0)) });

  if (teamsQuery.isPending) return <Skeleton className="h-72" />;
  if (teamsQuery.error) return <ErrorState message={teamsQuery.error.message} onRetry={() => void teamsQuery.refetch()} />;
  if (!teamsQuery.data.length) return <div className="space-y-5"><PageIntro eyebrow="Organization" title="Team coverage" description="See the operational teams you can work with and the access roles assigned to each member." /><Card><EmptyState title="No team access" description="Your account is not a member of an operational team." /></Card></div>;
  if (membersQuery.error && membersQuery.error instanceof ApiError && (membersQuery.error.status === 403 || membersQuery.error.status === 404)) {
    return <ErrorState message="You do not have permission to view this team's membership." onRetry={() => void membersQuery.refetch()} />;
  }

  const selected = teamsQuery.data.find((team) => team.id === selectedTeamId);
  const selectedWorkload = teamsQuery.data.findIndex((team) => team.id === selectedTeamId);
  const selectedItems = selectedWorkload >= 0 ? workloadQueries[selectedWorkload]?.data ?? [] : [];
  const riskItems = selectedItems.filter((item) => item.status !== "done" && item.due_date && item.due_date < new Date().toISOString().slice(0, 10));
  const blockedCount = selectedItems.filter((item) => item.status === "blocked").length;
  const reviewCount = selectedItems.filter((item) => item.status === "in_review").length;
  const selectedDashboardTeam = dashboard.data?.teams.find((team) => team.teamId === selectedTeamId);
  const active = (selectedDashboardTeam?.open ?? 0) + (selectedDashboardTeam?.inProgress ?? 0);
  const utilization = selectedDashboardTeam?.capacity ? Math.min(100, Math.round(active / selectedDashboardTeam.capacity * 100)) : null;
  return <div className="space-y-5">
    <PageIntro eyebrow="Organization" title="Team coverage" description="See the operational teams you can work with and the access roles assigned to each member." />
    <Card>
      <CardHeader title="Operating teams" description="Team membership and role-based access" />
      <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {teamsQuery.data.map((team) => {
          const stats = dashboard.data?.teams.find((entry) => entry.teamId === team.id);
          const load = (stats?.open ?? 0) + (stats?.inProgress ?? 0);
          const pct = team.capacity > 0 ? Math.min(100, load / team.capacity * 100) : 0;
          const workIndex = teamsQuery.data.findIndex((entry) => entry.id === team.id);
          const items = workloadQueries[workIndex]?.data ?? [];
          const atRisk = items.filter((item) => item.status !== "done" && item.due_date && item.due_date < new Date().toISOString().slice(0, 10)).length;
          return <button key={team.id} type="button" aria-pressed={team.id === selectedTeamId} onClick={() => setSelectedTeamId(team.id)} className={`rounded-xl border p-4 text-left transition-colors ${team.id === selectedTeamId ? "border-primary/45 bg-primary/[0.06]" : "border-border/70 bg-background/20 hover:border-primary/25"}`}>
            <span className="flex items-start justify-between gap-3"><span className="font-medium">{team.name}</span><span className="rounded-full border border-border/70 px-2 py-0.5 text-[9px] uppercase text-muted-foreground">{team.role}</span></span>
            <span className="mt-3 flex justify-between font-mono text-[10px] text-muted-foreground"><span>{stats?.open ?? "—"} open · {stats?.inProgress ?? "—"} underway</span><span>{team.capacity ? `${load}/${team.capacity}` : "No capacity set"}</span></span>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-background"><span className={`block h-full rounded-full ${pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-warning" : "bg-primary"}`} style={{ width: `${pct}%` }} /></span>
            <span className="mt-3 flex justify-between text-[10px] text-muted-foreground"><span>{team.member_count} members</span><span>{items.filter((item) => item.status === "blocked").length} blocked · {atRisk} overdue</span></span>
          </button>;
        })}
      </CardBody>
    </Card>
    <Card>
      <CardHeader title={selected ? `${selected.name} operations` : "Team operations"} description="Reported capacity, workflow bottlenecks and authorized membership." />
      {selected && <CardBody className="grid gap-3 border-b border-border sm:grid-cols-4">
        <TeamMetric label="Active load" value={`${active}`} detail={selected.capacity ? `${utilization}% of ${selected.capacity} capacity` : "Capacity not set"} />
        <TeamMetric label="Blocked" value={blockedCount} detail="Items awaiting unblocking" />
        <TeamMetric label="In review" value={reviewCount} detail="Awaiting manager/admin decision" />
        <TeamMetric label="Overdue" value={riskItems.length} detail={selectedItems.length >= 100 ? "Among first 100 returned items" : "Open items past due date"} />
      </CardBody>}
      {dashboard.error && <CardBody><p role="alert" className="text-xs text-warning">Team membership loaded, but workload totals are temporarily unavailable.</p></CardBody>}
      {selectedWorkload >= 0 && workloadQueries[selectedWorkload]?.error && <CardBody><p role="alert" className="text-xs text-warning">Detailed bottleneck and due-risk items could not be loaded for this team.</p></CardBody>}
      {membersQuery.isPending ? <CardBody><Skeleton className="h-28" /></CardBody> : membersQuery.error ? <CardBody><ErrorState message={membersQuery.error.message} onRetry={() => void membersQuery.refetch()} /></CardBody> : membersQuery.data.length === 0 ? <EmptyState title="No members found" /> : (
        <div className="divide-y divide-border/60">
          {membersQuery.data.map((member) => <div key={member.user_id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="font-medium">{member.full_name}</span><span className="rounded-full bg-secondary px-2.5 py-1 text-xs capitalize text-muted-foreground">{member.role}</span></div>)}
        </div>
      )}
    </Card>
    {dashboard.data && <div><div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Throughput context</h2><span className="text-[10px] text-muted-foreground">Global · not attributed by team in current API</span></div><WorkloadChart data={dashboard.data.weekly} /></div>}
  </div>;
}

function TeamMetric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="rounded-lg border border-border/60 bg-background/25 p-3"><p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-mono text-2xl">{value}</p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></div>;
}
