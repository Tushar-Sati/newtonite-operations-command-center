import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { AlertCircle, ArrowDownUp, Search } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { ErrorState, EmptyState, Skeleton } from "@/components/common/States";
import { PageIntro } from "@/components/common/PageIntro";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ApiError,
  claimWorkItem,
  createWorkItem,
  updateWorkItem,
  type WorkItemCreatePayload,
} from "@/lib/api/client";
import { dashboardQueryOptions } from "@/lib/api/dashboard";
import type { WorkItemRecord } from "@/lib/api/types";
import { teamMembersQueryOptions, teamsQueryOptions } from "@/lib/api/resources";
import {
  workItemQueryOptions,
  workItemsBoardQueryOptions,
  workItemTimelineQueryOptions,
} from "@/lib/api/work-items";
import {
  allowedWorkItemTransitions,
  dueRisk,
  filterWorkItems,
  sortWorkItems,
  WORKFLOW_LANES,
} from "@/lib/ops/workflow";
import { PriorityBadge, StatusBadge } from "@/components/common/StatusBadge";

export const Route = createLazyFileRoute("/work-items")({ component: WorkItemsPage });

const BOARD_SIZE = 100;
const fieldClass =
  "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground";
const labelClass = "block space-y-1.5 text-xs font-medium text-muted-foreground";

export function WorkItemsPage() {
  const queryClient = useQueryClient();
  const dashboard = useQuery(dashboardQueryOptions);
  const teamsQuery = useQuery(teamsQueryOptions());
  const [teamId, setTeamId] = useState("");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [dueFilter, setDueFilter] = useState("");
  const [sort, setSort] = useState<"priority" | "due" | "updated">("priority");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    priority: "medium",
    due_date: "",
    status: "open",
  });

  useEffect(() => {
    const firstTeam = dashboard.data?.teams[0];
    if (!teamId && firstTeam) setTeamId(firstTeam.teamId);
    if (teamId && firstTeam && !dashboard.data?.teams.some((team) => team.teamId === teamId))
      setTeamId(firstTeam.teamId);
  }, [dashboard.data?.teams, teamId]);

  const itemsQuery = useQuery(workItemsBoardQueryOptions(teamId, page * BOARD_SIZE));
  const detailQuery = useQuery(workItemQueryOptions(teamId, selectedId ?? ""));
  const timelineQuery = useQuery(workItemTimelineQueryOptions(teamId));
  const membersQuery = useQuery(teamMembersQueryOptions(teamId));
  const activeTeam = teamsQuery.data?.find((team) => team.id === teamId);
  const canWrite =
    activeTeam?.role === "admin" || activeTeam?.role === "manager" || activeTeam?.role === "member";
  const filteredItems = useMemo(
    () =>
      sortWorkItems(
        filterWorkItems(itemsQuery.data ?? [], {
          query: search,
          priority: priorityFilter,
          due: dueFilter,
        }),
        sort,
      ),
    [itemsQuery.data, search, priorityFilter, dueFilter, sort],
  );
  const refresh = async (itemId?: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["work-items", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["work-items-board", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["activity", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["team-network-work-items", teamId] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ...(itemId
        ? [queryClient.invalidateQueries({ queryKey: ["work-item", teamId, itemId] })]
        : []),
    ]);

  const claim = useMutation({
    mutationFn: (item: WorkItemRecord) => claimWorkItem(teamId, item.id),
    onSuccess: async () => {
      setMessage(null);
      setSuccess("Work item claimed.");
      await refresh();
    },
    onError: async (reason: unknown) => {
      const apiError = reason instanceof ApiError ? reason : null;
      const conflict = apiError?.status === 409;
      setMessage(
        apiError?.status === 403
          ? "Your team role cannot claim work items."
          : conflict
            ? "This item changed or was claimed by someone else. The board has been refreshed."
            : reason instanceof Error
              ? reason.message
              : "Could not claim work item.",
      );
      if (conflict) await refresh();
    },
  });

  const create = useMutation({
    mutationFn: (payload: WorkItemCreatePayload) => createWorkItem(teamId, payload),
    onSuccess: async () => {
      setCreateError(null);
      setSuccess("Work item created.");
      setCreateOpen(false);
      setPage(0);
      await refresh();
    },
    onError: (reason: unknown) =>
      setCreateError(reason instanceof Error ? reason.message : "Could not create work item."),
  });

  const update = useMutation({
    mutationFn: ({
      item,
      payload,
    }: {
      item: WorkItemRecord;
      payload: {
        title: string;
        description: string | null;
        priority: string;
        due_date: string | null;
        status: string;
      };
    }) => updateWorkItem(teamId, item.id, { ...payload, expected_version: item.version }),
    onSuccess: async (item) => {
      setEditError(null);
      setEditing(false);
      setSuccess("Work item updated.");
      await refresh(item.id);
    },
    onError: async (reason: unknown) => {
      const conflict = reason instanceof ApiError && reason.status === 409;
      setEditError(
        conflict
          ? "This item was changed by someone else. Latest details have been loaded; review them before editing again."
          : reason instanceof Error
            ? reason.message
            : "Could not update work item.",
      );
      if (conflict) {
        setEditing(false);
        if (selectedId) await refresh(selectedId);
      }
    },
  });

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setSuccess(null);
    const form = new FormData(event.currentTarget);
    const payload: WorkItemCreatePayload = {
      key: String(form.get("key")).trim(),
      title: String(form.get("title")).trim(),
      description: String(form.get("description")).trim() || null,
      priority: String(form.get("priority")),
      due_date: String(form.get("due_date")) || null,
    };
    create.mutate(payload);
  }

  function beginEdit(item: WorkItemRecord) {
    setEditDraft({
      title: item.title,
      description: item.description ?? "",
      priority: item.priority,
      due_date: item.due_date ?? "",
      status: item.status,
    });
    setEditError(null);
    setEditing(true);
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detailQuery.data) return;
    setEditError(null);
    setSuccess(null);
    update.mutate({
      item: detailQuery.data,
      payload: {
        title: editDraft.title.trim(),
        description: editDraft.description.trim() || null,
        priority: editDraft.priority,
        due_date: editDraft.due_date || null,
        status: editDraft.status,
      },
    });
  }

  if (dashboard.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  if (dashboard.error)
    return (
      <ErrorState message={dashboard.error.message} onRetry={() => void dashboard.refetch()} />
    );
  const teams = dashboard.data.teams;
  if (!teams.length)
    return (
      <div className="space-y-5">
        <PageIntro
          eyebrow="Execution"
          title="Work queue"
          description="Track commitments, remove blockers, and claim unassigned work across your teams."
        />
        <Card>
          <CardBody>
            <EmptyState
              title="No team access"
              description="Your account is not a member of an operational team. Ask an administrator to add you."
            />
          </CardBody>
        </Card>
      </div>
    );

  const teamName = teams.find((team) => team.teamId === teamId)?.team ?? "";
  return (
    <div className="space-y-5">
      <PageIntro
        eyebrow="Execution · Work orders"
        title="Work queue"
        description="Track commitments, remove blockers, and claim unassigned work across your teams."
      />
      <Card>
        <CardBody className="flex flex-wrap items-end gap-4">
          <label className="min-w-56 space-y-1.5 text-xs font-medium text-muted-foreground">
            Team
            <select
              aria-label="Team"
              className={fieldClass}
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value);
                setPage(0);
                setSelectedId(null);
                setMessage(null);
              }}
            >
              {teams.map((team) => (
                <option key={team.teamId} value={team.teamId}>
                  {team.team}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-52 space-y-1.5 text-xs font-medium text-muted-foreground">
            Search work
            <span className="relative block">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
              <input
                aria-label="Search work items"
                className={`${fieldClass} pl-9`}
                placeholder="Key, title, or owner"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>
          <label className="min-w-32 space-y-1.5 text-xs font-medium text-muted-foreground">
            Priority
            <select
              aria-label="Filter priority"
              className={fieldClass}
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
            >
              <option value="">Any priority</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="min-w-36 space-y-1.5 text-xs font-medium text-muted-foreground">
            Due risk
            <select
              aria-label="Filter due risk"
              className={fieldClass}
              value={dueFilter}
              onChange={(event) => setDueFilter(event.target.value)}
            >
              <option value="">Any due date</option>
              <option value="at_risk">Due today or overdue</option>
              <option value="overdue">Overdue only</option>
            </select>
          </label>
          <label className="min-w-36 space-y-1.5 text-xs font-medium text-muted-foreground">
            Sort by
            <span className="relative block">
              <ArrowDownUp className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
              <select
                aria-label="Sort work items"
                className={`${fieldClass} pl-9`}
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
              >
                <option value="priority">Priority</option>
                <option value="due">Nearest due date</option>
                <option value="updated">Recently changed</option>
              </select>
            </span>
          </label>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Segment {page + 1}</span>
            <Button
              disabled={!canWrite}
              title={!canWrite ? "A writable team role is required" : undefined}
              onClick={() => {
                setCreateError(null);
                setSuccess(null);
                setCreateOpen(true);
              }}
            >
              Create work item
            </Button>
          </div>
        </CardBody>
      </Card>

      {!teamsQuery.isPending && !canWrite && (
        <p
          role="status"
          className="rounded-md border border-warning/25 bg-warning/[0.04] px-3 py-2 text-xs text-warning"
        >
          {teamsQuery.error
            ? "Team permissions could not be confirmed; write actions are disabled."
            : "View-only team role. Claim, create, and edit actions require member, manager, or admin access."}
        </p>
      )}
      {message && (
        <div
          role="alert"
          className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning"
        >
          {message}
        </div>
      )}
      {success && (
        <div
          role="status"
          className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
        >
          {success}
        </div>
      )}
      {itemsQuery.isPending ? (
        <Skeleton className="h-80" />
      ) : itemsQuery.error ? (
        <ErrorState message={itemsQuery.error.message} onRetry={() => void itemsQuery.refetch()} />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            title="Work-item command board"
            description={`${teamName} · ${filteredItems.length} visible across five workflow lanes${itemsQuery.data?.length === BOARD_SIZE ? " · first 100 in this segment" : ""}`}
          />
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-5">
            {WORKFLOW_LANES.map((lane) => {
              const laneItems = filteredItems.filter((item) => item.status === lane.status);
              return (
                <section
                  key={lane.status}
                  aria-label={`${lane.label} lane`}
                  className="min-w-0 rounded-xl border border-border/60 bg-background/25"
                >
                  <header className="sticky top-0 flex items-center justify-between gap-2 rounded-t-xl border-b border-border/50 bg-card/90 px-3 py-2.5 backdrop-blur">
                    <h2 className="text-xs font-semibold">{lane.label}</h2>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {laneItems.length}
                    </span>
                  </header>
                  <div className="max-h-[520px] space-y-2 overflow-y-auto p-2">
                    {laneItems.length === 0 ? (
                      <p className="px-2 py-6 text-center text-[10px] text-muted-foreground">
                        No matching items
                      </p>
                    ) : (
                      laneItems.map((item) => {
                        const risk = dueRisk(item);
                        return (
                          <article
                            key={item.id}
                            className="rounded-lg border border-border/60 bg-card/80 p-3 transition-colors hover:border-primary/35"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedId(item.id);
                                setEditing(false);
                                setEditError(null);
                              }}
                              className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Open ${item.key}: ${item.title}`}
                            >
                              <span className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[9px] text-muted-foreground">
                                  {item.key}
                                </span>
                                <PriorityBadge priority={item.priority} />
                              </span>
                              <span className="mt-2 line-clamp-2 block text-xs font-medium leading-relaxed">
                                {item.title}
                              </span>
                            </button>
                            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-[9px]">
                              <span
                                className="max-w-[55%] truncate text-muted-foreground"
                                title={item.assignee_id ?? "Unassigned"}
                              >
                                {item.assignee_id
                                  ? `Owner ${membersQuery.data?.find((member) => member.user_id === item.assignee_id)?.full_name ?? item.assignee_id.slice(0, 8)}`
                                  : "Unassigned"}
                              </span>
                              <span
                                className={
                                  risk === "overdue"
                                    ? "flex items-center gap-1 text-destructive"
                                    : risk === "due_today"
                                      ? "text-warning"
                                      : "text-muted-foreground"
                                }
                              >
                                {risk === "overdue" && <AlertCircle className="h-3 w-3" />}
                                {item.due_date
                                  ? `${risk === "overdue" ? "Overdue · " : "Due · "}${item.due_date}`
                                  : "No due date"}
                              </span>
                            </div>
                            {item.status === "in_review" && (
                              <p className="mt-2 rounded bg-warning/5 px-2 py-1 text-[9px] text-warning">
                                Awaiting approval decision
                              </p>
                            )}
                            {item.status === "open" && !item.assignee_id && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="mt-2 h-7 w-full text-[10px]"
                                disabled={!canWrite || claim.isPending}
                                title={!canWrite ? "A writable team role is required" : undefined}
                                onClick={() => claim.mutate(item)}
                              >
                                {claim.isPending ? "Claiming…" : "Claim work"}
                              </Button>
                            )}
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          {filteredItems.length === 0 && (
            <div className="px-4 pb-4">
              <EmptyState
                title="No work matches these filters"
                description="Clear the search or adjust the priority and due-risk filters."
              />
            </div>
          )}
        </Card>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((value) => Math.max(0, value - 1))}
        >
          Previous
        </Button>
        <span className="px-2 text-xs text-muted-foreground">
          {itemsQuery.data?.length ?? 0} fetched
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={(itemsQuery.data?.length ?? 0) < BOARD_SIZE}
          onClick={() => setPage((value) => value + 1)}
        >
          Next segment
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create work item</DialogTitle>
            <DialogDescription>
              Add a new item to {teamName}. The server validates and deduplicates the request.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={submitCreate}>
            <label className={labelClass}>
              Key
              <input
                className={fieldClass}
                aria-label="Key"
                name="key"
                required
                minLength={1}
                maxLength={40}
                pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
                aria-describedby="create-key-help"
              />
              <span id="create-key-help" className="block font-normal">
                Letters, numbers, underscores, and hyphens.
              </span>
            </label>
            <label className={labelClass}>
              Title
              <input
                className={fieldClass}
                aria-label="Title"
                name="title"
                required
                minLength={1}
                maxLength={240}
              />
            </label>
            <label className={labelClass}>
              Description
              <textarea
                className="min-h-20 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground"
                name="description"
              />
            </label>
            <label className={labelClass}>
              Priority
              <select className={fieldClass} name="priority" defaultValue="medium">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className={labelClass}>
              Due date
              <input className={fieldClass} name="due_date" type="date" />
            </label>
            {createError && (
              <p role="alert" className="text-sm text-destructive">
                {createError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create item"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setEditing(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailQuery.data?.key ?? selectedId ?? "Work item"}</DialogTitle>
            <DialogDescription>Current details from the backend.</DialogDescription>
          </DialogHeader>
          {detailQuery.isPending ? (
            <Skeleton className="h-24" />
          ) : detailQuery.error ? (
            <ErrorState
              message={detailQuery.error.message}
              onRetry={() => void detailQuery.refetch()}
            />
          ) : (
            detailQuery.data &&
            (editing ? (
              <form className="space-y-3" onSubmit={submitEdit}>
                {success && (
                  <p role="status" className="text-sm text-success">
                    {success}
                  </p>
                )}
                <label className={labelClass}>
                  Title
                  <input
                    className={fieldClass}
                    required
                    minLength={1}
                    maxLength={240}
                    value={editDraft.title}
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, title: event.target.value }))
                    }
                  />
                </label>
                <label className={labelClass}>
                  Description
                  <textarea
                    className="min-h-20 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground"
                    value={editDraft.description}
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, description: event.target.value }))
                    }
                  />
                </label>
                <label className={labelClass}>
                  Priority
                  <select
                    className={fieldClass}
                    value={editDraft.priority}
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, priority: event.target.value }))
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </label>
                <label className={labelClass}>
                  Due date
                  <input
                    className={fieldClass}
                    type="date"
                    value={editDraft.due_date}
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, due_date: event.target.value }))
                    }
                  />
                </label>
                <label className={labelClass}>
                  Workflow state
                  <select
                    aria-label="Workflow state"
                    className={fieldClass}
                    value={editDraft.status}
                    onChange={(event) =>
                      setEditDraft((draft) => ({ ...draft, status: event.target.value }))
                    }
                  >
                    <option value={detailQuery.data.status}>
                      {detailQuery.data.status.replaceAll("_", " ")}
                    </option>
                    {allowedWorkItemTransitions(detailQuery.data.status).map((statusOption) => (
                      <option key={statusOption} value={statusOption}>
                        {statusOption.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <span className="block font-normal">
                    Approval completion is only available in the decision queue.
                  </span>
                </label>
                {editError && (
                  <p role="alert" className="text-sm text-destructive">
                    {editError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Saving uses version {detailQuery.data.version}; stale edits are rejected by the
                  server.
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={update.isPending}>
                    {update.isPending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 text-sm">
                {success && (
                  <p role="status" className="text-sm text-success">
                    {success}
                  </p>
                )}
                <p className="font-medium">{detailQuery.data.title}</p>
                <p className="text-muted-foreground">
                  {detailQuery.data.description || "No description"}
                </p>
                <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <StatusBadge status={detailQuery.data.status} />
                  </dd>
                  <dt className="text-muted-foreground">Priority</dt>
                  <dd>
                    <PriorityBadge priority={detailQuery.data.priority} />
                  </dd>
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd>
                    {detailQuery.data.assignee_id
                      ? (membersQuery.data?.find(
                          (member) => member.user_id === detailQuery.data?.assignee_id,
                        )?.full_name ?? "Assigned")
                      : "Unassigned"}
                  </dd>
                  <dt className="text-muted-foreground">Version</dt>
                  <dd>{detailQuery.data.version}</dd>
                  <dt className="text-muted-foreground">Due</dt>
                  <dd>{detailQuery.data.due_date ?? "—"}</dd>
                </dl>
                {detailQuery.data.status === "in_review" && (
                  <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                    Awaiting manager or admin decision. Use the Approvals queue to complete this
                    transition.
                  </p>
                )}
                {editError && (
                  <p role="alert" className="text-sm text-destructive">
                    {editError}
                  </p>
                )}
                {!canWrite && (
                  <p className="text-xs text-muted-foreground">
                    Your team role is read-only. A member, manager, or admin role is required to
                    change this item.
                  </p>
                )}
                {canWrite && (
                  <div className="flex justify-end">
                    <Button onClick={() => beginEdit(detailQuery.data!)}>Edit work item</Button>
                  </div>
                )}
                <section
                  className="border-t border-border pt-3"
                  aria-label="Work item activity timeline"
                >
                  <h3 className="mb-2 text-xs font-semibold">Activity timeline</h3>
                  {timelineQuery.isPending ? (
                    <Skeleton className="h-16" />
                  ) : timelineQuery.error ? (
                    <p role="alert" className="text-xs text-destructive">
                      Recent team activity could not be loaded.
                    </p>
                  ) : (timelineQuery.data ?? []).filter(
                      (event) => event.work_item?.id === detailQuery.data?.id,
                    ).length ? (
                    <ol className="max-h-40 space-y-2 overflow-auto">
                      {(timelineQuery.data ?? [])
                        .filter((event) => event.work_item?.id === detailQuery.data?.id)
                        .map((event) => (
                          <li
                            key={event.id}
                            className="flex justify-between gap-3 border-l border-primary/30 pl-3 text-xs"
                          >
                            <span>
                              <strong>{event.actor}</strong> {event.action}
                            </span>
                            <time
                              className="shrink-0 text-muted-foreground"
                              dateTime={event.occurred_at}
                            >
                              {new Date(event.occurred_at).toLocaleString()}
                            </time>
                          </li>
                        ))}
                    </ol>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No matching events in the latest 100 team records.
                    </p>
                  )}
                </section>
              </div>
            ))
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
