import { AlertCircle, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDot, Clock, Loader } from "lucide-react";
import type { ComponentType } from "react";
import { Card, CardBody, CardHeader } from "@/components/common/Card";
import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState } from "@/components/common/States";
import { PriorityBadge, StatusBadge } from "@/components/common/StatusBadge";
import type { ActivityEvent, KpiSummary, TeamWorkload, WeeklyWorkload, WorkItem } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function KpiCard({ label, value, delta, icon: Icon, invert, tone }: { label: string; value: number; delta: number; icon: ComponentType<{ className?: string }>; invert?: boolean; tone: string }) {
  const good = invert ? delta < 0 : delta > 0;
  const Arrow = delta >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className={cn("h-4 w-4", tone)} />
      </div>
      <p className="mt-3 text-3xl font-semibold tabular">{value}</p>
      <p className={cn("mt-1 flex items-center gap-1 text-xs", good ? "text-success" : "text-destructive")}>
        <Arrow className="h-3.5 w-3.5" />
        {Math.abs(delta).toFixed(1)}% <span className="text-muted-foreground">vs last week</span>
      </p>
    </Card>
  );
}

export function KpiGrid({ kpis }: { kpis: KpiSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Open items" value={kpis.openItems} delta={kpis.deltas.open} icon={CircleDot} tone="text-muted-foreground" invert />
      <KpiCard label="In progress" value={kpis.inProgressItems} delta={kpis.deltas.inProgress} icon={Loader} tone="text-primary" />
      <KpiCard label="Overdue" value={kpis.overdueItems} delta={kpis.deltas.overdue} icon={AlertCircle} tone="text-destructive" invert />
      <KpiCard label="Pending approvals" value={kpis.pendingApprovals} delta={kpis.deltas.approvals} icon={Clock} tone="text-warning" invert />
    </div>
  );
}

export function WorkloadChart({ data }: { data: WeeklyWorkload[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.created, d.completed]));
  return (
    <Card>
      <CardHeader
        title="Workload trend"
        description="Items created vs completed, last 7 weeks"
        action={
          <div className="flex gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary" />Created</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-success" />Completed</span>
          </div>
        }
      />
      <CardBody>
        {data.length === 0 ? (
          <EmptyState title="No workload data yet" />
        ) : (
          <div className="flex h-56 items-end gap-3 sm:gap-5" role="img" aria-label="Bar chart of weekly created and completed items">
            {data.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-48 w-full items-end justify-center gap-1">
                  <div className="w-full max-w-4 rounded-t-sm bg-primary transition-all" style={{ height: `${(d.created / max) * 100}%` }} title={`Created: ${d.created}`} />
                  <div className="w-full max-w-4 rounded-t-sm bg-success/80 transition-all" style={{ height: `${(d.completed / max) * 100}%` }} title={`Completed: ${d.completed}`} />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{d.label}</span>
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
      <CardHeader title="Team workload" description="Active items vs capacity" />
      <CardBody className="space-y-4">
        {teams.length === 0 && <EmptyState title="No teams yet" />}
        {teams.map((t) => {
          const active = t.open + t.inProgress;
          const pct = Math.min(100, Math.round((active / t.capacity) * 100));
          const tone = pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-warning" : "bg-primary";
          return (
            <div key={t.team}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{t.team} <span className="text-xs font-normal text-muted-foreground">· {t.members} people</span></span>
                <span className="shrink-0 text-xs tabular text-muted-foreground">{active}/{t.capacity} · {pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
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
      <CardHeader title="Recent activity" />
      {events.length === 0 ? (
        <EmptyState title="No recent activity" />
      ) : (
        <ul className="divide-y divide-border/60">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 px-5 py-3">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.kind === "approved" || e.kind === "completed" ? "bg-success" : e.kind === "created" ? "bg-primary" : "bg-muted-foreground")} />
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
  { key: "id", header: "ID", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.id}</span> },
  { key: "title", header: "Title", className: "whitespace-normal min-w-44", cell: (r) => <span className="font-medium">{r.title}</span> },
  { key: "team", header: "Team", className: "hidden xl:table-cell", cell: (r) => <span className="text-muted-foreground">{r.team}</span> },
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

export function WorkItemsOverview({ items }: { items: WorkItem[] }) {
  return (
    <Card>
      <CardHeader title="Work items overview" description="Most recently updated items" />
      <DataTable columns={columns} rows={items} rowKey={(r) => r.id} empty={<EmptyState title="No work items" description="Items will appear here once created." />} />
    </Card>
  );
}
