import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/common/Button";
import { Card, CardBody, CardHeader } from "@/components/common/Card";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { ApiError } from "@/lib/api/client";
import { PageIntro } from "@/components/common/PageIntro";
import { activityQueryOptions, teamsQueryOptions } from "@/lib/api/resources";
import { filterActivity } from "@/lib/ops/workflow";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [{ title: "Activity — Newtonite Operations" }, { name: "description", content: "Team activity history in Newtonite Operations." }] }),
  component: ActivityPage,
});

const PAGE_SIZE = 20;

export function ActivityPage() {
  const teamsQuery = useQuery(teamsQueryOptions());
  const [teamId, setTeamId] = useState("");
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState("");
  const [actor, setActor] = useState("");
  useEffect(() => {
    const teams = teamsQuery.data ?? [];
    const firstTeamId = teams[0]?.id;
    if (!teamId && firstTeamId) setTeamId(firstTeamId);
    if (teamId && firstTeamId && !teams.some((team) => team.id === teamId)) setTeamId(firstTeamId);
  }, [teamsQuery.data, teamId]);
  const activityQuery = useQuery(activityQueryOptions(teamId, page * PAGE_SIZE));

  if (teamsQuery.isPending) return <Skeleton className="h-72" />;
  if (teamsQuery.error) return <ErrorState message={teamsQuery.error.message} onRetry={() => void teamsQuery.refetch()} />;
  if (!teamsQuery.data.length) return <div className="space-y-5"><PageIntro eyebrow="Audit trail" title="Operations activity" description="Review team-scoped work changes, claims and approval decisions in chronological order." /><Card><EmptyState title="No team activity available" description="Activity is available for teams you belong to." /></Card></div>;
  if (activityQuery.isPending) return <Skeleton className="h-80" />;
  if (activityQuery.error) return <ErrorState message={activityQuery.error instanceof ApiError && (activityQuery.error.status === 403 || activityQuery.error.status === 404) ? "You do not have permission to view activity for this team." : activityQuery.error.message} onRetry={() => void activityQuery.refetch()} />;
  const events = activityQuery.data;
  const team = teamsQuery.data.find((entry) => entry.id === teamId);
  const visibleEvents = filterActivity(events, category, actor);

  return <div className="space-y-5">
    <PageIntro eyebrow="Audit trail" title="Operations activity" description="Review team-scoped work changes, claims and approval decisions in chronological order." />
    <Card>
    <CardHeader title="Team event log" description={team ? `Audit events in ${team.name} · newest first` : "Team activity history"} action={<label className="text-xs text-muted-foreground">Team<select aria-label="Team" className="ml-2 h-9 rounded-md border border-input bg-surface px-3 text-sm text-foreground" value={teamId} onChange={(event) => { setTeamId(event.target.value); setPage(0); }}>
      {teamsQuery.data.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select></label>} />
    <CardBody className="flex flex-wrap items-end gap-3 border-b border-border">
      <label className="min-w-44 space-y-1.5 text-xs text-muted-foreground">Event category<select aria-label="Filter event category" className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option><option value="created">Created</option><option value="updated">Updated</option><option value="claimed">Claimed</option><option value="approved">Approved</option></select></label>
      <label className="min-w-52 space-y-1.5 text-xs text-muted-foreground">Actor identity<input aria-label="Filter actor" className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground" placeholder="Search actor name" value={actor} onChange={(event) => setActor(event.target.value)} /></label>
      <span className="ml-auto text-[10px] text-muted-foreground">Filters apply to this 20-event page · event IDs retained below for audit reference</span>
    </CardBody>
    {events.length === 0 ? <EmptyState title={page ? "End of the event log" : "No operational events recorded"} description={page ? "There are no older events after this page." : "Successful work-item and approval changes are recorded here."} /> : visibleEvents.length === 0 ? <EmptyState title="No events match these filters" description="Adjust the category or actor filter to see more audit events." /> : <ol className="divide-y divide-border/60">
      {visibleEvents.map((event) => <li key={event.id} className="flex gap-3 px-5 py-4">
        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.kind === "approved" ? "bg-success" : event.kind === "created" ? "bg-primary" : event.kind === "claimed" ? "bg-warning" : "bg-muted-foreground"}`} />
        <div className="min-w-0 flex-1"><p className="text-sm"><span className="font-medium">{event.actor}</span> <span className="text-muted-foreground">{event.action}</span><span className="ml-2 rounded border border-border/60 px-1.5 py-0.5 font-mono text-[8px] uppercase text-muted-foreground">{event.kind}</span></p>
          {event.work_item && <p className="mt-0.5 truncate text-xs text-muted-foreground">{event.work_item.key} · {event.work_item.title}</p>}
          <p className="mt-1 truncate font-mono text-[8px] text-muted-foreground/70" title={`Event ${event.id}`}>Event ID · {event.id}</p>
        </div>
        <time className="shrink-0 text-right text-xs text-muted-foreground" dateTime={event.occurred_at}><span className="block">{new Date(event.occurred_at).toLocaleString()}</span><span className="font-mono text-[9px]">{new Date(event.occurred_at).toISOString()}</span></time>
      </li>)}
    </ol>}
    <CardBody className="flex items-center justify-between border-t border-border"><span className="text-xs text-muted-foreground">Page {page + 1} · {visibleEvents.length} shown of {events.length} events</span><div className="flex gap-2">
      <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
      <Button size="sm" variant="secondary" disabled={events.length < PAGE_SIZE} onClick={() => setPage((value) => value + 1)}>Next</Button>
    </div></CardBody>
    </Card>
  </div>;
}
