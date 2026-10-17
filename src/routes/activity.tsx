import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/common/Button";
import { Card, CardBody, CardHeader } from "@/components/common/Card";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { ApiError } from "@/lib/api/client";
import { activityQueryOptions, teamsQueryOptions } from "@/lib/api/resources";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [{ title: "Activity — Newtonite Operations" }, { name: "description", content: "Team activity history in Newtonite Operations." }] }),
  component: ActivityPage,
});

const PAGE_SIZE = 20;

export function ActivityPage() {
  const teamsQuery = useQuery(teamsQueryOptions());
  const [teamId, setTeamId] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const teams = teamsQuery.data ?? [];
    const firstTeamId = teams[0]?.id;
    if (!teamId && firstTeamId) setTeamId(firstTeamId);
    if (teamId && firstTeamId && !teams.some((team) => team.id === teamId)) setTeamId(firstTeamId);
  }, [teamsQuery.data, teamId]);
  const activityQuery = useQuery(activityQueryOptions(teamId, page * PAGE_SIZE));

  if (teamsQuery.isPending) return <Skeleton className="h-72" />;
  if (teamsQuery.error) return <ErrorState message={teamsQuery.error.message} onRetry={() => void teamsQuery.refetch()} />;
  if (!teamsQuery.data.length) return <Card><EmptyState title="No teams yet" description="Activity is available for teams you belong to." /></Card>;
  if (activityQuery.isPending) return <Skeleton className="h-80" />;
  if (activityQuery.error) return <ErrorState message={activityQuery.error instanceof ApiError && (activityQuery.error.status === 403 || activityQuery.error.status === 404) ? "You do not have permission to view activity for this team." : activityQuery.error.message} onRetry={() => void activityQuery.refetch()} />;
  const events = activityQuery.data;
  const team = teamsQuery.data.find((entry) => entry.id === teamId);

  return <Card>
    <CardHeader title="Activity" description={team ? `Recent changes in ${team.name}` : "Team activity history"} action={<label className="text-xs text-muted-foreground">Team<select aria-label="Team" className="ml-2 h-9 rounded-md border border-input bg-surface px-3 text-sm text-foreground" value={teamId} onChange={(event) => { setTeamId(event.target.value); setPage(0); }}>
      {teamsQuery.data.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select></label>} />
    {events.length === 0 ? <EmptyState title="No activity on this page" description={page ? "There are no more events." : "Team changes will appear here."} /> : <ol className="divide-y divide-border/60">
      {events.map((event) => <li key={event.id} className="flex gap-3 px-5 py-4">
        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.kind === "approved" ? "bg-success" : event.kind === "created" ? "bg-primary" : "bg-muted-foreground"}`} />
        <div className="min-w-0 flex-1"><p className="text-sm"><span className="font-medium">{event.actor}</span> <span className="text-muted-foreground">{event.action}</span></p>
          {event.work_item && <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.work_item.key} · {event.work_item.title}</p>}
        </div>
        <time className="shrink-0 text-xs text-muted-foreground" dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString()}</time>
      </li>)}
    </ol>}
    <CardBody className="flex items-center justify-between border-t border-border"><span className="text-xs text-muted-foreground">Page {page + 1} · {events.length} events</span><div className="flex gap-2">
      <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
      <Button size="sm" variant="secondary" disabled={events.length < PAGE_SIZE} onClick={() => setPage((value) => value + 1)}>Next</Button>
    </div></CardBody>
  </Card>;
}
