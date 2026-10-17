import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardBody } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { ErrorState, EmptyState, Skeleton } from "@/components/common/States";
import { WorkItemsOverview } from "@/components/dashboard/DashboardWidgets";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError, claimWorkItem, createWorkItem, updateWorkItem, type WorkItemCreatePayload } from "@/lib/api/client";
import { dashboardQueryOptions } from "@/lib/api/dashboard";
import type { WorkItem, WorkItemRecord } from "@/lib/api/types";
import { workItemQueryOptions, workItemsQueryOptions } from "@/lib/api/work-items";

export const Route = createFileRoute("/work-items")({
  head: () => ({ meta: [{ title: "Work Items — Newtonite Operations" }, { name: "description", content: "Team work items in Newtonite Operations." }] }),
  component: WorkItemsPage,
});

const PAGE_SIZE = 20;
const fieldClass = "h-9 w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground";
const labelClass = "block space-y-1.5 text-xs font-medium text-muted-foreground";

export function WorkItemsPage() {
  const queryClient = useQueryClient();
  const dashboard = useQuery(dashboardQueryOptions);
  const [teamId, setTeamId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ title: "", description: "", priority: "medium", due_date: "" });

  useEffect(() => {
    const firstTeam = dashboard.data?.teams[0];
    if (!teamId && firstTeam) setTeamId(firstTeam.teamId);
    if (teamId && firstTeam && !dashboard.data?.teams.some((team) => team.teamId === teamId)) setTeamId(firstTeam.teamId);
  }, [dashboard.data?.teams, teamId]);

  const itemsQuery = useQuery(workItemsQueryOptions(teamId, status, page * PAGE_SIZE));
  const detailQuery = useQuery(workItemQueryOptions(teamId, selected?.recordId ?? ""));
  const refresh = async (itemId?: string) => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["work-items", teamId] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ...(itemId ? [queryClient.invalidateQueries({ queryKey: ["work-item", teamId, itemId] })] : []),
  ]);

  const claim = useMutation({
    mutationFn: (item: WorkItem) => claimWorkItem(teamId, item.recordId ?? item.id),
    onSuccess: async () => { setMessage(null); setSuccess("Work item claimed."); await refresh(); },
    onError: async (reason: unknown) => {
      const conflict = reason instanceof ApiError && reason.status === 409;
      setMessage(conflict ? "This item changed or was claimed by someone else. The list has been refreshed." : reason instanceof Error ? reason.message : "Could not claim work item.");
      if (conflict) await refresh();
    },
  });

  const create = useMutation({
    mutationFn: (payload: WorkItemCreatePayload) => createWorkItem(teamId, payload),
    onSuccess: async () => {
      setCreateError(null); setSuccess("Work item created."); setCreateOpen(false); setPage(0); setStatus("");
      await refresh();
    },
    onError: (reason: unknown) => setCreateError(reason instanceof Error ? reason.message : "Could not create work item."),
  });

  const update = useMutation({
    mutationFn: ({ item, payload }: { item: WorkItemRecord; payload: { title: string; description: string | null; priority: string; due_date: string | null } }) =>
      updateWorkItem(teamId, item.id, { ...payload, expected_version: item.version }),
    onSuccess: async (item) => {
      setEditError(null); setEditing(false); setSuccess("Work item updated."); await refresh(item.id);
    },
    onError: async (reason: unknown) => {
      const conflict = reason instanceof ApiError && reason.status === 409;
      setEditError(conflict ? "This item was changed by someone else. Latest details have been loaded; review them before editing again." : reason instanceof Error ? reason.message : "Could not update work item.");
      if (conflict) {
        setEditing(false);
        if (selected?.recordId) await refresh(selected.recordId);
      }
    },
  });

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreateError(null); setSuccess(null);
    const form = new FormData(event.currentTarget);
    const payload: WorkItemCreatePayload = {
      key: String(form.get("key")).trim(), title: String(form.get("title")).trim(),
      description: String(form.get("description")).trim() || null,
      priority: String(form.get("priority")), due_date: String(form.get("due_date")) || null,
    };
    create.mutate(payload);
  }

  function beginEdit(item: WorkItemRecord) {
    setEditDraft({ title: item.title, description: item.description ?? "", priority: item.priority, due_date: item.due_date ?? "" });
    setEditError(null); setEditing(true);
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detailQuery.data) return;
    setEditError(null); setSuccess(null);
    update.mutate({ item: detailQuery.data, payload: { title: editDraft.title.trim(), description: editDraft.description.trim() || null, priority: editDraft.priority, due_date: editDraft.due_date || null } });
  }

  if (dashboard.isPending) return <div className="space-y-4"><Skeleton className="h-12" /><Skeleton className="h-96" /></div>;
  if (dashboard.error) return <ErrorState message={dashboard.error.message} onRetry={() => void dashboard.refetch()} />;
  const teams = dashboard.data.teams;
  if (!teams.length) return <Card><CardBody><EmptyState title="No teams available" description="Your account is not a member of a team. Ask an administrator to add you." /></CardBody></Card>;

  const teamName = teams.find((team) => team.teamId === teamId)?.team ?? "";
  const items: WorkItem[] = (itemsQuery.data ?? []).map((item) => ({
    id: item.key, recordId: item.id, title: item.title, team: teamName,
    assignee: item.assignee_id ?? "Unassigned", status: item.status, priority: item.priority,
    dueDate: item.due_date ?? "—",
    overdue: Boolean(item.due_date && item.due_date < new Date().toISOString().slice(0, 10) && item.status !== "done"),
  }));

  return (
    <div className="space-y-4">
      <Card><CardBody className="flex flex-wrap items-end gap-4">
        <label className="min-w-56 space-y-1.5 text-xs font-medium text-muted-foreground">Team
          <select aria-label="Team" className={fieldClass} value={teamId} onChange={(event) => { setTeamId(event.target.value); setPage(0); setSelected(null); }}>
            {teams.map((team) => <option key={team.teamId} value={team.teamId}>{team.team}</option>)}
          </select>
        </label>
        <label className="min-w-44 space-y-1.5 text-xs font-medium text-muted-foreground">Status
          <select aria-label="Status" className={fieldClass} value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }}>
            <option value="">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option>
            <option value="blocked">Blocked</option><option value="in_review">In review</option><option value="done">Done</option>
          </select>
        </label>
        <div className="ml-auto flex items-center gap-3"><span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button onClick={() => { setCreateError(null); setSuccess(null); setCreateOpen(true); }}>Create work item</Button>
        </div>
      </CardBody></Card>

      {message && <div role="alert" className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">{message}</div>}
      {success && <div role="status" className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">{success}</div>}
      {itemsQuery.isPending ? <Skeleton className="h-80" /> : itemsQuery.error ? <ErrorState message={itemsQuery.error.message} onRetry={() => void itemsQuery.refetch()} /> : (
        <WorkItemsOverview items={items} title="Work items" description={`Items for ${teamName}${status ? ` · ${status.replaceAll("_", " ")}` : ""}`} onOpen={(item) => { setSelected(item); setEditing(false); setEditError(null); }} onClaim={(item) => claim.mutate(item)} />
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Button>
        <span className="px-2 text-xs text-muted-foreground">{items.length} items</span>
        <Button variant="secondary" size="sm" disabled={items.length < PAGE_SIZE} onClick={() => setPage((value) => value + 1)}>Next</Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent><DialogHeader><DialogTitle>Create work item</DialogTitle><DialogDescription>Add a new item to {teamName}. The server validates and deduplicates the request.</DialogDescription></DialogHeader>
          <form className="space-y-3" onSubmit={submitCreate}>
            <label className={labelClass}>Key<input className={fieldClass} aria-label="Key" name="key" required minLength={1} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" aria-describedby="create-key-help" /><span id="create-key-help" className="block font-normal">Letters, numbers, underscores, and hyphens.</span></label>
            <label className={labelClass}>Title<input className={fieldClass} aria-label="Title" name="title" required minLength={1} maxLength={240} /></label>
            <label className={labelClass}>Description<textarea className="min-h-20 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground" name="description" /></label>
            <label className={labelClass}>Priority<select className={fieldClass} name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
            <label className={labelClass}>Due date<input className={fieldClass} name="due_date" type="date" /></label>
            {createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create item"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) { setSelected(null); setEditing(false); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{detailQuery.data?.key ?? selected?.id ?? "Work item"}</DialogTitle><DialogDescription>Current details from the backend.</DialogDescription></DialogHeader>
          {detailQuery.isPending ? <Skeleton className="h-24" /> : detailQuery.error ? <ErrorState message={detailQuery.error.message} onRetry={() => void detailQuery.refetch()} /> : detailQuery.data && (
            editing ? <form className="space-y-3" onSubmit={submitEdit}>
              {success && <p role="status" className="text-sm text-success">{success}</p>}
              <label className={labelClass}>Title<input className={fieldClass} required minLength={1} maxLength={240} value={editDraft.title} onChange={(event) => setEditDraft((draft) => ({ ...draft, title: event.target.value }))} /></label>
              <label className={labelClass}>Description<textarea className="min-h-20 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm text-foreground" value={editDraft.description} onChange={(event) => setEditDraft((draft) => ({ ...draft, description: event.target.value }))} /></label>
              <label className={labelClass}>Priority<select className={fieldClass} value={editDraft.priority} onChange={(event) => setEditDraft((draft) => ({ ...draft, priority: event.target.value }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
              <label className={labelClass}>Due date<input className={fieldClass} type="date" value={editDraft.due_date} onChange={(event) => setEditDraft((draft) => ({ ...draft, due_date: event.target.value }))} /></label>
              {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
              <p className="text-xs text-muted-foreground">Saving uses version {detailQuery.data.version}; stale edits are rejected by the server.</p>
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save changes"}</Button></div>
            </form> : <div className="space-y-3 text-sm">
              {success && <p role="status" className="text-sm text-success">{success}</p>}
              <p className="font-medium">{detailQuery.data.title}</p><p className="text-muted-foreground">{detailQuery.data.description || "No description"}</p>
              <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs"><dt className="text-muted-foreground">Status</dt><dd>{detailQuery.data.status.replaceAll("_", " ")}</dd><dt className="text-muted-foreground">Priority</dt><dd>{detailQuery.data.priority}</dd><dt className="text-muted-foreground">Version</dt><dd>{detailQuery.data.version}</dd><dt className="text-muted-foreground">Due</dt><dd>{detailQuery.data.due_date ?? "—"}</dd></dl>
              {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
              <div className="flex justify-end"><Button onClick={() => beginEdit(detailQuery.data!)}>Edit work item</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
