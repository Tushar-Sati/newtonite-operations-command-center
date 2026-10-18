import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/common/Button";
import { Card, CardBody, CardHeader } from "@/components/common/Card";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState, ErrorState, Skeleton } from "@/components/common/States";
import { ApiError, approveWorkItem } from "@/lib/api/client";
import type { WorkItemRecord } from "@/lib/api/types";
import { approvalsQueryOptions, teamsQueryOptions } from "@/lib/api/resources";
import { PageIntro } from "@/components/common/PageIntro";
import { prioritizeApprovals } from "@/lib/ops/workflow";
import { PriorityBadge } from "@/components/common/StatusBadge";

export const Route = createLazyFileRoute("/approvals")({ component: ApprovalsPage });

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
      setMessage(null);
      setSuccess("Work item approved and marked done.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["approvals", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["activity", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["work-items", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["team-network-work-items", teamId] }),
      ]);
    },
    onError: async (reason: unknown) => {
      const error = reason instanceof ApiError ? reason : null;
      setMessage(
        error?.status === 403
          ? "Your team role cannot approve work items."
          : error?.status === 409
            ? "This item changed or is no longer awaiting approval. The queue has been refreshed."
            : reason instanceof Error
              ? reason.message
              : "Could not approve work item.",
      );
      setSuccess(null);
      if (error?.status === 409) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["approvals", teamId] }),
          queryClient.invalidateQueries({ queryKey: ["work-items", teamId] }),
        ]);
      }
    },
  });

  if (teamsQuery.isPending) return <Skeleton className="h-72" />;
  if (teamsQuery.error)
    return (
      <ErrorState message={teamsQuery.error.message} onRetry={() => void teamsQuery.refetch()} />
    );
  if (!teamsQuery.data.length)
    return (
      <div className="space-y-5">
        <PageIntro
          eyebrow="Decision control"
          title="Approval queue"
          description="Resolve eligible items in review so approved work can close and teams can move forward."
        />
        <Card>
          <EmptyState
            title="No team approval queues"
            description="Approval queues are available for teams you belong to."
          />
        </Card>
      </div>
    );
  if (approvalsQuery.isPending) return <Skeleton className="h-80" />;
  if (approvalsQuery.error)
    return (
      <ErrorState
        message={
          approvalsQuery.error instanceof ApiError &&
          (approvalsQuery.error.status === 403 || approvalsQuery.error.status === 404)
            ? "You do not have permission to view approvals for this team."
            : approvalsQuery.error.message
        }
        onRetry={() => void approvalsQuery.refetch()}
      />
    );
  const team = teamsQuery.data.find((entry) => entry.id === teamId);
  const canApprove = team?.role === "admin" || team?.role === "manager";
  const prioritized = prioritizeApprovals(approvalsQuery.data);
  const ageLabel = (createdAt: string) => {
    const hours = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 3_600_000));
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  };
  const columns: Column<WorkItemRecord>[] = [
    {
      key: "key",
      header: "ID",
      cell: (item) => <span className="font-mono text-xs text-muted-foreground">{item.key}</span>,
    },
    {
      key: "title",
      header: "Title",
      className: "whitespace-normal",
      cell: (item) => <span className="font-medium">{item.title}</span>,
    },
    {
      key: "priority",
      header: "Priority",
      cell: (item) => <PriorityBadge priority={item.priority} />,
    },
    {
      key: "age",
      header: "Waiting",
      cell: (item) => (
        <span
          className={
            Date.now() - Date.parse(item.created_at) >= 86_400_000
              ? "font-mono text-xs text-warning"
              : "font-mono text-xs text-muted-foreground"
          }
        >
          {ageLabel(item.created_at)}
        </span>
      ),
    },
    {
      key: "due",
      header: "Due",
      cell: (item) => (
        <span className="font-mono text-xs text-muted-foreground">
          {item.due_date ?? "Not set"}
        </span>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (item) => (
        <span className="text-xs text-muted-foreground">
          {item.assignee_id ? item.assignee_id.slice(0, 8) : "Unassigned"}
        </span>
      ),
    },
    {
      key: "version",
      header: "Version",
      cell: (item) => <span className="font-mono text-xs">{item.version}</span>,
    },
    {
      key: "action",
      header: "Action",
      cell: (item) =>
        canApprove ? (
          <Button
            size="sm"
            disabled={approve.isPending}
            onClick={() => {
              setMessage(null);
              setSuccess(null);
              approve.mutate(item);
            }}
          >
            Approve
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Manager or admin required</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageIntro
        eyebrow="Decision control"
        title="Approval queue"
        description="Resolve eligible items in review so approved work can close and teams can move forward."
      />
      <Card>
        <CardHeader
          title="Decision queue"
          description="Priority-ranked in-review work; older and higher-priority items surface first."
          action={
            <label className="text-xs text-muted-foreground">
              Team
              <select
                aria-label="Team"
                className="ml-2 h-9 rounded-md border border-input bg-surface px-3 text-sm text-foreground"
                value={teamId}
                onChange={(event) => {
                  setTeamId(event.target.value);
                  setMessage(null);
                  setSuccess(null);
                }}
              >
                {teamsQuery.data.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          }
        />
        {message && (
          <p
            role="alert"
            className="mx-5 mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {message}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="mx-5 mt-4 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
          >
            {success}
          </p>
        )}
        {approvalsQuery.data.length > 0 && (
          <CardBody className="grid gap-3 border-b border-border sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-background/25 p-3">
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Awaiting decision
              </p>
              <p className="mt-1 font-mono text-2xl">{prioritized.length}</p>
            </div>
            <div className="rounded-lg border border-warning/20 bg-warning/[0.04] p-3">
              <p className="font-mono text-[9px] uppercase tracking-wider text-warning">
                High priority
              </p>
              <p className="mt-1 font-mono text-2xl">
                {
                  prioritized.filter(
                    (item) => item.priority === "high" || item.priority === "critical",
                  ).length
                }
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/25 p-3">
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Longest wait
              </p>
              <p className="mt-1 font-mono text-2xl">
                {ageLabel(
                  prioritized.reduce(
                    (oldest, item) =>
                      Date.parse(item.created_at) < Date.parse(oldest.created_at) ? item : oldest,
                    prioritized[0]!,
                  ).created_at,
                )}
              </p>
            </div>
          </CardBody>
        )}
        {prioritized.length ? (
          <DataTable columns={columns} rows={prioritized} rowKey={(item) => item.id} />
        ) : (
          <EmptyState
            title="No pending approvals"
            description="No eligible work is waiting for a decision. Items appear here when they move into the in-review state."
          />
        )}
        <CardBody className="border-t border-border text-[11px] text-muted-foreground">
          The approval endpoint contains only in-review items. Blocked work remains in the Work
          Items board; no blocked approval records are available from this API.
        </CardBody>
        {!canApprove && (
          <CardBody className="border-t border-border text-xs text-muted-foreground">
            You can view this team's queue, but only a team manager or admin can approve items.
          </CardBody>
        )}
      </Card>
    </div>
  );
}
