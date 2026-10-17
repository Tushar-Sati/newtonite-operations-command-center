import { queryOptions } from "@tanstack/react-query";
import { requestJson } from "./client";
import { DashboardResponseSchema, type ActivityEvent, type DashboardData } from "./types";

export function adaptDashboard(input: unknown): DashboardData {
  const response = DashboardResponseSchema.parse(input);
  const activityKind = (kind: string): ActivityEvent["kind"] => {
    if (kind === "created" || kind === "approved" || kind === "commented" || kind === "completed") return kind;
    return "updated";
  };
  return {
    kpis: {
      openItems: response.kpis.open_items,
      inProgressItems: response.kpis.in_progress_items,
      overdueItems: response.kpis.overdue_items,
      pendingApprovals: response.kpis.pending_approvals,
      deltas: {
        open: response.kpis.deltas.open,
        inProgress: response.kpis.deltas.in_progress,
        overdue: response.kpis.deltas.overdue,
        approvals: response.kpis.deltas.approvals,
      },
    },
    weekly: response.weekly,
    teams: response.teams.map((team) => ({
      teamId: team.team_id, team: team.team, members: team.members,
      open: team.open, inProgress: team.in_progress, capacity: team.capacity,
    })),
    activity: response.activity.map((event) => ({ ...event, kind: activityKind(event.kind) })),
    workItems: response.work_items.map((item) => ({
      id: item.id, title: item.title, team: item.team, assignee: item.assignee,
      status: item.status, priority: item.priority,
      dueDate: item.due_date ?? "", overdue: item.overdue,
    })),
  };
}

export async function fetchDashboard(): Promise<DashboardData> {
  const response = await requestJson("/dashboard", DashboardResponseSchema);
  return adaptDashboard(response);
}

export const dashboardQueryOptions = queryOptions({
  queryKey: ["dashboard"],
  queryFn: fetchDashboard,
});
