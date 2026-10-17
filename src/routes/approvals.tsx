import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/common/Button";
import { Card, CardBody, CardHeader } from "@/components/common/Card";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { ApiError, approveWorkItem } from "@/lib/api/client";
import type { WorkItemRecord } from "@/lib/api/types";
import { approvalsQueryOptions, teamsQueryOptions } from "@/lib/api/resources";

export const Route = createFileRoute("/approvals")({
  head: () => ({ meta: [{ title: "Approvals — Newtonite Operations" }, { name: "description", content: "Work items awaiting team approval." }] }),
  component: ApprovalsPage,
});

export function ApprovalsPage() {
  const queryClient = useQueryClient();
  const teamsQuery = useQuery(teamsQueryOptions());
  const [teamId, setTeamId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  useEffect(() => {
    const teams = teamsQuery.data ?? [];
    const firstTeamId = teams[0]?.id;
    if (!teamId && firstTeamId) setTeamId(firstTeamId);
    if (teamId && firstTeamId && !teams.some((team) => team.id === teamId)) setTeamId(firstTeamId);
  }, [teamsQuery.data, teamId]);
  const approvalsQuery = useQuery(approvalsQueryOptions(teamId));
  const approve = useMutation({
    mutationFn: (item: WorkItemRecord) => approveWorkItem(teamId, item.id, item.version),
    onSuccess: async () => {
      setMessage(null); setSuccess("Work item approved and marked done.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["approvals", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["activity", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["work-items", teamId] }),
      ]);
    },
    onError: async (reason: unknown) => {
      const error = reason instanceof ApiError ? reason : null;
      setMessage(error?.status === 403 ? "Your team role cannot approve work items." : error?.status === 409 ? "This item changed or is no longer awaiting approval. The queue has been refreshed." : reason instanceof Error ? reason.message : "Could not approve work item.");
      setSuccess(null);
      if (error?.status === 409) {
        await Promise.all([queryClient.invalidateQueries({ queryKey: ["approvals", teamId] }), queryClient.invalidateQueries({ queryKey: ["work-items", teamId] })]);
      }
    },
  });

  if (teamsQuery.isPending) return <Skeleton className="h-72" />;
  if (teamsQuery.error) return <ErrorState message={teamsQuery.error.message} onRetry={() => void teamsQuery.refetch()} />;
  if (!teamsQuery.data.length) return <Card><EmptyState title="No teams yet" description="Approval queues are available for teams you belong to." /></Card>;
  if (approvalsQuery.isPending) return <Skeleton className="h-80" />;
  if (approvalsQuery.error) return <ErrorState message={approvalsQuery.error instanceof ApiError && (approvalsQuery.error.status === 403 || approvalsQuery.error.status === 404) ? "You do not have permission to view approvals for this team." : approvalsQuery.error.message} onRetry={() => void approvalsQuery.refetch()} />;
  const team = teamsQuery.data.find((entry) => entry.id === teamId);
  const canApprove = team?.role === "admin" || team?.role === "manager";
  const columns: Column<WorkItemRecord>[] = [
    { key: "key", header: "ID", cell: (item) => <span className="font-mono text-xs text-muted-foreground">{item.key}</span> },
    { key: "title", header: "Title", className: "whitespace-normal", cell: (item) => <span className="font-medium">{item.title}</span> },
    { key: "priority", header: "Priority", cell: (item) => <span className="capitalize">{item.priority}</span> },
    { key: "version", header: "Version", cell: (item) => <span className="font-mono text-xs">{item.version}</span> },
    { key: "action", header: "Action", cell: (item) => canApprove
      ? <Button size="sm" disabled={approve.isPending} onClick={() => { setMessage(null); setSuccess(null); approve.mutate(item); }}>Approve</Button>
      : <span className="text-xs text-muted-foreground">Manager or admin required</span> },
  ];

  return <Card>
    <CardHeader title="Approvals" description="Items in review need an authorized manager or admin." action={<label className="text-xs text-muted-foreground">Team<select aria-label="Team" className="ml-2 h-9 rounded-md border border-input bg-surface px-3 text-sm text-foreground" value={teamId} onChange={(event) => { setTeamId(event.target.value); setMessage(null); setSuccess(null); }}>
      {teamsQuery.data.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select></label>} />
    {message && <p role="alert" className="mx-5 mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{message}</p>}
    {success && <p role="status" className="mx-5 mt-4 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">{success}</p>}
    {approvalsQuery.data.length ? <DataTable columns={columns} rows={approvalsQuery.data} rowKey={(item) => item.id} /> : <EmptyState title="No pending approvals" description="Items enter this queue when their status changes to in review." />}
    {!canApprove && <CardBody className="border-t border-border text-xs text-muted-foreground">You can view this team's queue, but only a team manager or admin can approve items.</CardBody>}
  </Card>;
}
