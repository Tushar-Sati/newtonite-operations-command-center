import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardBody, CardHeader } from "@/components/common/Card";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { ApiError } from "@/lib/api/client";
import { teamMembersQueryOptions, teamsQueryOptions } from "@/lib/api/resources";

export const Route = createFileRoute("/teams")({
  head: () => ({ meta: [{ title: "Teams — Newtonite Operations" }, { name: "description", content: "Teams you belong to in Newtonite Operations." }] }),
  component: TeamsPage,
});

export function TeamsPage() {
  const teamsQuery = useQuery(teamsQueryOptions());
  const [selectedTeamId, setSelectedTeamId] = useState("");
  useEffect(() => {
    const teams = teamsQuery.data ?? [];
    const firstTeamId = teams[0]?.id;
    if (!selectedTeamId && firstTeamId) setSelectedTeamId(firstTeamId);
    if (selectedTeamId && firstTeamId && !teams.some((team) => team.id === selectedTeamId)) setSelectedTeamId(firstTeamId);
  }, [teamsQuery.data, selectedTeamId]);
  const membersQuery = useQuery(teamMembersQueryOptions(selectedTeamId));

  if (teamsQuery.isPending) return <Skeleton className="h-72" />;
  if (teamsQuery.error) return <ErrorState message={teamsQuery.error.message} onRetry={() => void teamsQuery.refetch()} />;
  if (!teamsQuery.data.length) return <Card><EmptyState title="No teams yet" description="Your account is not a member of a team." /></Card>;
  if (membersQuery.error && membersQuery.error instanceof ApiError && (membersQuery.error.status === 403 || membersQuery.error.status === 404)) {
    return <ErrorState message="You do not have permission to view this team's membership." onRetry={() => void membersQuery.refetch()} />;
  }

  const selected = teamsQuery.data.find((team) => team.id === selectedTeamId);
  return <div className="space-y-4">
    <Card>
      <CardHeader title="Your teams" description="Teams and membership details available to your account." />
      <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {teamsQuery.data.map((team) => <button key={team.id} type="button" aria-pressed={team.id === selectedTeamId} onClick={() => setSelectedTeamId(team.id)} className={`rounded-md border p-4 text-left transition-colors ${team.id === selectedTeamId ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50"}`}>
          <span className="block font-medium">{team.name}</span><span className="mt-1 block text-xs text-muted-foreground">{team.role} · {team.member_count} members · capacity {team.capacity}</span>
        </button>)}
      </CardBody>
    </Card>
    <Card>
      <CardHeader title={selected ? `${selected.name} members` : "Team members"} description="Only active member names and team roles are shown." />
      {membersQuery.isPending ? <CardBody><Skeleton className="h-28" /></CardBody> : membersQuery.error ? <CardBody><ErrorState message={membersQuery.error.message} onRetry={() => void membersQuery.refetch()} /></CardBody> : membersQuery.data.length === 0 ? <EmptyState title="No members found" /> : (
        <div className="divide-y divide-border/60">
          {membersQuery.data.map((member) => <div key={member.user_id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="font-medium">{member.full_name}</span><span className="rounded-full bg-secondary px-2.5 py-1 text-xs capitalize text-muted-foreground">{member.role}</span></div>)}
        </div>
      )}
    </Card>
  </div>;
}
