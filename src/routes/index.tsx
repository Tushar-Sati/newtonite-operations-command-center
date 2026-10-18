import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { ActivityPanel, KpiGrid, TeamWorkloadSummary, WorkItemsOverview, WorkloadChart } from "@/components/dashboard/DashboardWidgets";
import { Card, CardHeader } from "@/components/common/Card";
import { ErrorState, Skeleton } from "@/components/common/States";
import { dashboardQueryOptions } from "@/lib/api/dashboard";
import type { DashboardData } from "@/lib/api/types";
import { Activity, ArrowDownRight, ArrowUpRight, ListTodo, ShieldCheck, Users } from "lucide-react";

const GlobalOperationsNetwork = lazy(() => import("@/components/dashboard/GlobalOperationsNetwork"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operations Command Center — Newtonite Operations" },
      { name: "description", content: "See active work, overdue risk, approval decisions, team workload and recent operational changes." },
      { property: "og:title", content: "Operations Command Center — Newtonite Operations" },
      { property: "og:description", content: "See active work, overdue risk, approval decisions, team workload and recent operational changes." },
    ],
  }),
  pendingComponent: DashboardSkeleton,
  errorComponent: ({ error }) => <DashboardError message={error instanceof Error ? error.message : "Unknown error"} />,
  component: Dashboard,
});

function Dashboard() {
  const { data, isPending, error, refetch } = useQuery(dashboardQueryOptions);
  if (isPending) return <DashboardSkeleton />;
  if (error || !data) return <ErrorState message={error instanceof Error ? error.message : "Dashboard data is unavailable."} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-6">
      <section className="command-hero relative isolate overflow-hidden rounded-2xl border border-primary/20 px-5 py-6 shadow-panel sm:px-8 sm:py-8 lg:grid lg:min-h-[260px] lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-10" aria-labelledby="command-title">
        <div aria-hidden="true" className="command-orbit pointer-events-none absolute -right-36 -top-44 -z-10 h-[500px] w-[500px] rounded-full border border-primary/10 lg:right-[-7rem] lg:top-[-9rem]">
          <span className="absolute inset-12 rounded-full border border-primary/[0.08]" /><span className="absolute inset-28 rounded-full border border-primary/[0.07]" /><span className="absolute inset-44 rounded-full border border-primary/[0.06]" />
        </div>
        <div className="relative max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.07] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.17em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_9px_var(--primary)]" />Operations command center · live team-scoped view</div>
          <h1 id="command-title" className="max-w-xl text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl lg:text-[42px]">A clear operating picture.<br /><span className="text-gradient">Decisive action across teams.</span></h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">Coordinate operational work, approvals, and team capacity. See what is moving, blocked, or at risk—and act from one team-scoped view.</p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link to="/work-items" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_6px_22px_-10px_var(--primary)] transition-all hover:-translate-y-0.5 hover:brightness-105">Open work queue <ArrowDownRight className="h-4 w-4" /></Link>
            <Link to="/approvals" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white/[0.035] px-4 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/[0.06]">Review decisions <ArrowUpRight className="h-4 w-4 text-primary" /></Link>
          </div>
        </div>
        <div className="relative mt-8 grid grid-cols-2 gap-2.5 lg:mt-0 lg:grid-cols-1">
          <Link to="/work-items" className="group flex items-center gap-3 rounded-xl border border-border/70 bg-background/35 p-3.5 backdrop-blur transition-all hover:border-primary/35 hover:bg-background/55 sm:p-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><ListTodo className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Execution</span><span className="mt-0.5 block text-[10px] text-muted-foreground">Work queue & claims</span></span><ArrowUpRight className="hidden h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 sm:block" />
          </Link>
          <Link to="/teams" className="group flex items-center gap-3 rounded-xl border border-border/70 bg-background/35 p-3.5 backdrop-blur transition-all hover:border-primary/35 hover:bg-background/55 sm:p-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-success/10 text-success"><Users className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Capacity</span><span className="mt-0.5 block text-[10px] text-muted-foreground">Team load & membership</span></span><ArrowUpRight className="hidden h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 sm:block" />
          </Link>
          <Link to="/activity" className="group col-span-2 flex items-center gap-3 rounded-xl border border-border/70 bg-background/35 p-3.5 backdrop-blur transition-all hover:border-primary/35 hover:bg-background/55 lg:col-span-1 sm:p-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-warning/10 text-warning"><Activity className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Accountability</span><span className="mt-0.5 block text-[10px] text-muted-foreground">Auditable work history</span></span><ArrowUpRight className="hidden h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 sm:block" />
          </Link>
        </div>
        <div className="absolute bottom-4 right-5 hidden items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/55 lg:flex"><ShieldCheck className="h-3 w-3 text-success" /> Scoped access · Audit enabled</div>
      </section>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">Operational snapshot · Counts reflect the latest backend response · Historical KPI comparisons are not available</p>
      <KpiGrid kpis={data.kpis} />
      <DeferredOperationsNetwork data={data} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2"><WorkloadChart data={data.weekly} /></div>
        <ActivityPanel events={data.activity} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <TeamWorkloadSummary teams={data.teams} />
        <div className="min-w-0 xl:col-span-2"><WorkItemsOverview items={data.workItems} /></div>
      </div>
    </div>
  );
}

function DeferredOperationsNetwork({ data }: { data: DashboardData }) {
  const [clientReady, setClientReady] = useState(false);
  useEffect(() => setClientReady(true), []);
  return (
    <Suspense fallback={<NetworkLoading />}>
      {clientReady ? <GlobalOperationsNetwork data={data} /> : <NetworkLoading />}
    </Suspense>
  );
}

function NetworkLoading() {
  return <Card><CardHeader title="Global Operations Network" description="Loading team-scoped operational topology…" /><div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]"><Skeleton className="h-[420px]" /><Skeleton className="h-[420px]" /></div></Card>;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

function DashboardError({ message }: { message: string }) {
  const router = useRouter();
  return <ErrorState message={message} onRetry={() => router.invalidate()} />;
}
