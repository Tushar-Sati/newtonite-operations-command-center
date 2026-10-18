import type { TeamWorkload, WorkItemRecord } from "@/lib/api/types";
import type { ActivityRecordData } from "@/lib/api/types";

export type NetworkSignal = "healthy" | "attention" | "critical";

export function recentActivityIntensity(events: ActivityRecordData[] | undefined, now = Date.now()): number {
  const cutoff = now - 7 * 24 * 60 * 60 * 1000;
  const recentCount = (events ?? []).filter((event) => {
    const timestamp = Date.parse(event.occurred_at);
    return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now;
  }).length;
  return Math.min(1, recentCount / 15);
}

export function networkNodeSize(load: number, signal: NetworkSignal): number {
  return 0.062 + Math.min(1, Math.max(0, load)) * 0.045 + (signal === "critical" ? 0.018 : signal === "attention" ? 0.008 : 0);
}

export function networkPosition(index: number, count: number): [number, number, number] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = count <= 1 ? 0 : 1 - (2 * (index + 0.5)) / count;
  const ring = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = goldenAngle * index;
  return [ring * Math.cos(angle) * 1.51, y * 1.51, ring * Math.sin(angle) * 1.51];
}

export function getNetworkSignal(team: TeamWorkload, items: WorkItemRecord[] | undefined, unavailable = false): { signal: NetworkSignal; load: number; overdue: number } {
  const active = team.open + team.inProgress;
  const load = team.capacity > 0 ? active / team.capacity : 0;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = (items ?? []).filter((item) => item.due_date && item.due_date < today && item.status !== "done").length;
  const overloaded = team.capacity > 0 && active > team.capacity;
  if (overdue > 0 || overloaded) return { signal: "critical", load, overdue };
  if (unavailable || (team.capacity <= 0 && active > 0) || load >= 0.8 || (items ?? []).some((item) => item.status === "blocked" || item.status === "in_review")) {
    return { signal: "attention", load, overdue };
  }
  return { signal: "healthy", load, overdue };
}
