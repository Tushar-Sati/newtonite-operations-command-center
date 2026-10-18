import { Activity, AlertCircle, ArrowUpRight, CheckCircle2, CircleDot, Clock, Loader } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { Card, CardBody, CardHeader } from "@/components/common/Card";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/States";
import { PriorityBadge, StatusBadge } from "@/components/common/StatusBadge";
import type { ActivityEvent, KpiSummary, TeamWorkload, WeeklyWorkload, WorkItem } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function KpiCard({ label, value, icon: Icon, tone, signal }: { label: string; value: number; icon: ComponentType<{ className?: string }>; tone: string; signal: "neutral" | "cyan" | "amber" | "red" }) {
  return (
    <Card data-signal={signal} className="metric-panel panel-interactive group relative overflow-hidden p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
        <span className={cn("grid h-9 w-9 place-items-center rounded-lg border border-border/70 bg-white/[0.025] transition-transform duration-200 group-hover:scale-105", tone)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-mono text-4xl font-medium tracking-tight tabular sm:text-[42px]">{value.toLocaleString()}</p>
        <span className="pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">Now</span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Current team-scoped total</p>
    </Card>
  );
}

export function KpiGrid({ kpis }: { kpis: KpiSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Open work" value={kpis.openItems} icon={CircleDot} tone="text-muted-foreground" signal="neutral" />
      <KpiCard label="Underway" value={kpis.inProgressItems} icon={Loader} tone="text-primary" signal="cyan" />
      <KpiCard label="Overdue risk" value={kpis.overdueItems} icon={AlertCircle} tone="text-destructive" signal="red" />
      <KpiCard label="Awaiting approval" value={kpis.pendingApprovals} icon={Clock} tone="text-warning" signal="amber" />
    </div>
  );
}

export function WorkloadChart({ data }: { data: WeeklyWorkload[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.created, d.completed]));
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Operational throughput"
        description="Work items created and completed over the last 7 weeks"
        action={
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary" />Created</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-success" />Completed</span>
          </div>
        }
      />
      <CardBody className="px-4 pb-5 pt-6 sm:px-5">
        {data.length === 0 ? (
          <EmptyState title="No throughput history yet" description="Weekly created and completed work will appear as operations are recorded." />
        ) : (
          <div className="relative flex h-60 items-end gap-2 px-1 pb-1 sm:gap-5" role="img" aria-label="Bar chart of weekly created and completed items">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-1 bottom-7 top-2 flex flex-col justify-between">
              {[0, 1, 2, 3].map((line) => <span key={line} className="border-t border-dashed border-border/50" />)}
            </div>
            {data.map((d) => (
              <div key={d.label} className="relative z-[1] flex h-full flex-1 flex-col items-center justify-end gap-2">
                <div className="flex h-[calc(100%-1.25rem)] w-full items-end justify-center gap-1.5">
                  <div className="w-full max-w-5 rounded-t-sm bg-gradient-to-t from-primary/35 to-primary shadow-[0_0_16px_-10px_var(--primary)] transition-all duration-500 hover:brightness-125" style={{ height: `${Math.max(d.created > 0 ? 3 : 0, (d.created / max) * 100)}%` }} title={`Created: ${d.created}`} />
                  <div className="w-full max-w-5 rounded-t-sm bg-gradient-to-t from-success/25 to-success shadow-[0_0_14px_-10px_var(--success)] transition-all duration-500 hover:brightness-125" style={{ height: `${Math.max(d.completed > 0 ? 3 : 0, (d.completed / max) * 100)}%` }} title={`Completed: ${d.completed}`} />
                </div>
                <span className="font-mono text-[9px] tracking-wide text-muted-foreground">{d.label}</span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function TeamWorkloadSummary({ teams }: { teams: TeamWorkload[] }) {
  return (
    <Card>
      <CardHeader title="Team capacity" description="Active work against reported operating capacity" />
      <CardBody className="space-y-4">
        {teams.length === 0 && <EmptyState title="No teams yet" />}
        {teams.map((t) => {
          const active = t.open + t.inProgress;
          const pct = t.capacity > 0 ? Math.min(100, Math.round((active / t.capacity) * 100)) : 0;
          const tone = pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-warning" : "bg-primary";
          return (
            <div key={t.team}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{t.team} <span className="text-xs font-normal text-muted-foreground">· {t.members} people</span></span>
                <span className="shrink-0 text-xs tabular text-muted-foreground">{t.capacity > 0 ? `${active}/${t.capacity} · ${pct}%` : `${active} active · capacity not set`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full border border-border/40 bg-background/70">
                <div className={cn("h-full rounded-full transition-all duration-700", tone, pct >= 90 && "shadow-[0_0_12px_-4px_currentColor]")} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export function ActivityPanel({ events }: { events: ActivityEvent[] }) {
  return (
    <Card>
      <CardHeader title="Latest operations log" description="Recent work and approval changes" action={<Link to="/activity" aria-label="Open full activity log" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"><ArrowUpRight className="h-4 w-4" /></Link>} />
      {events.length === 0 ? (
        <EmptyState title="No operational changes recorded" description="Work-item creation, claims, updates and approvals will appear here." />
      ) : (
        <ul className="relative divide-y divide-border/50 before:absolute before:bottom-5 before:left-[29px] before:top-5 before:border-l before:border-dashed before:border-border/70">
          {events.map((e) => (
            <li key={e.id} className="group relative flex gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.025]">
              <span className={cn("relative z-[1] mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-card", e.kind === "approved" || e.kind === "completed" ? "bg-success" : e.kind === "created" ? "bg-primary" : "bg-muted-foreground")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{e.actor}</span> <span className="text-muted-foreground">{e.action}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{e.target}</p>
              </div>
              <time className="shrink-0 font-mono text-[11px] text-muted-foreground" dateTime={e.timestamp}>{timeFmt.format(new Date(e.timestamp))}</time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const columns: Column<WorkItem>[] = [
  { key: "id", header: "Reference", cell: (r) => <span className="rounded border border-border/70 bg-background/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{r.id}</span> },
  { key: "title", header: "Title", className: "whitespace-normal", cell: (r) => <span className="font-medium">{r.title}</span> },
  { key: "team", header: "Team", className: "hidden lg:table-cell", cell: (r) => <span className="text-muted-foreground">{r.team}</span> },
  { key: "assignee", header: "Assignee", cell: (r) => r.assignee },
  { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  { key: "priority", header: "Priority", cell: (r) => <PriorityBadge priority={r.priority} /> },
  {
    key: "due",
    header: "Due",
    cell: (r) => (
      <span className={cn("flex items-center gap-1 font-mono text-xs tabular", r.overdue ? "text-destructive" : "text-muted-foreground")}>
        {r.overdue ? <AlertCircle className="h-3.5 w-3.5" /> : r.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : null}
        {r.dueDate}
      </span>
    ),
  },
];

export function WorkItemsOverview({
  items,
  title = "Priority work snapshot",
  description = "Recent commitments, owners, status and due dates",
  onOpen,
  onClaim,
}: {
  items: WorkItem[];
  title?: string;
  description?: string;
  onOpen?: (item: WorkItem) => void;
  onClaim?: (item: WorkItem) => void;
}) {
  const displayColumns = columns.map((column) => column.key === "title" && onOpen
    ? { ...column, cell: (row: WorkItem) => <button className="text-left font-medium hover:text-primary hover:underline" onClick={() => onOpen(row)}>{row.title}</button> }
    : column);
  if (onClaim) displayColumns.push({ key: "action", header: "Action", cell: (row: WorkItem) => row.status === "open" && row.assignee === "Unassigned"
    ? <button className="text-xs font-medium text-primary hover:underline" onClick={() => onClaim(row)}>Claim</button>
    : <span className="text-xs text-muted-foreground">—</span> });
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} description={description} action={<span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"><Activity className="h-3 w-3 text-primary" />Priority feed</span>} />
      <DataTable columns={displayColumns} rows={items} rowKey={(r) => r.id} empty={<EmptyState title="No work items in this view" description="Create a work item to coordinate operational follow-through across your team." />} />
    </Card>
  );
}
