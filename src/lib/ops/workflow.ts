import type { ActivityRecordData, WorkItemRecord, WorkItemStatus } from "@/lib/api/types";

export const WORKFLOW_LANES: { status: WorkItemStatus; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "in_review", label: "In review" },
  { status: "done", label: "Done" },
];

const TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  open: ["in_progress", "blocked"],
  in_progress: ["blocked", "in_review"],
  blocked: ["in_progress"],
  in_review: ["in_progress"],
  done: [],
};

export function allowedWorkItemTransitions(status: WorkItemStatus) { return TRANSITIONS[status]; }

const PRIORITY_WEIGHT: Record<WorkItemRecord["priority"], number> = { critical: 4, high: 3, medium: 2, low: 1 };

export function dueRisk(item: Pick<WorkItemRecord, "due_date" | "status">, today = new Date().toISOString().slice(0, 10)) {
  if (!item.due_date || item.status === "done") return "none" as const;
  if (item.due_date < today) return "overdue" as const;
  if (item.due_date === today) return "due_today" as const;
  return "scheduled" as const;
}

export function filterWorkItems(items: WorkItemRecord[], filters: { query?: string; priority?: string; due?: string }) {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  return items.filter((item) => {
    if (query && !`${item.key} ${item.title} ${item.assignee_id ?? "unassigned"}`.toLocaleLowerCase().includes(query)) return false;
    if (filters.priority && item.priority !== filters.priority) return false;
    const risk = dueRisk(item);
    if (filters.due === "at_risk" && risk !== "overdue" && risk !== "due_today") return false;
    if (filters.due === "overdue" && risk !== "overdue") return false;
    return true;
  });
}

export function sortWorkItems(items: WorkItemRecord[], sort: "priority" | "due" | "updated") {
  return [...items].sort((left, right) => {
    if (sort === "priority") return PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority] || left.created_at.localeCompare(right.created_at);
    if (sort === "due") return (left.due_date ?? "9999-12-31").localeCompare(right.due_date ?? "9999-12-31") || PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority];
    return right.updated_at.localeCompare(left.updated_at);
  });
}

export function prioritizeApprovals(items: WorkItemRecord[]) {
  return [...items].sort((left, right) => PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority] || left.created_at.localeCompare(right.created_at));
}

export function filterActivity(events: ActivityRecordData[], category: string, actor: string) {
  const normalizedActor = actor.trim().toLocaleLowerCase();
  return events.filter((event) => (!category || event.kind === category) && (!normalizedActor || event.actor.toLocaleLowerCase().includes(normalizedActor)));
}
