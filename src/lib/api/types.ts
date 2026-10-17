// Domain types shared by the UI and the data layer.
// Shape these to match the future FastAPI response schemas.

export type WorkItemStatus = "open" | "in_progress" | "blocked" | "in_review" | "done";
export type Priority = "low" | "medium" | "high" | "critical";

export interface WorkItem {
  id: string;
  title: string;
  team: string;
  assignee: string;
  status: WorkItemStatus;
  priority: Priority;
  dueDate: string; // ISO date
  overdue: boolean;
}

export interface KpiSummary {
  openItems: number;
  inProgressItems: number;
  overdueItems: number;
  pendingApprovals: number;
  /** Change vs previous period, in percent */
  deltas: { open: number; inProgress: number; overdue: number; approvals: number };
}

export interface TeamWorkload {
  team: string;
  members: number;
  open: number;
  inProgress: number;
  capacity: number; // max concurrent items
}

export interface WeeklyWorkload {
  label: string;
  created: number;
  completed: number;
}

export interface ActivityEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string; // ISO datetime
  kind: "created" | "updated" | "approved" | "commented" | "completed";
}

export interface DashboardData {
  kpis: KpiSummary;
  weekly: WeeklyWorkload[];
  teams: TeamWorkload[];
  activity: ActivityEvent[];
  workItems: WorkItem[];
}
