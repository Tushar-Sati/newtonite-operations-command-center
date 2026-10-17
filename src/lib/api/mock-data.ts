// ⚠️ TEMPORARY MOCK DATA — replace with FastAPI responses.
// Nothing in this file is real. It exists only so the UI can be reviewed.
import type { DashboardData } from "./types";

export const MOCK_DASHBOARD: DashboardData = {
  kpis: {
    openItems: 128,
    inProgressItems: 47,
    overdueItems: 9,
    pendingApprovals: 14,
    deltas: { open: 4.2, inProgress: -2.1, overdue: 12.5, approvals: -8.0 },
  },
  weekly: [
    { label: "W36", created: 32, completed: 28 },
    { label: "W37", created: 41, completed: 35 },
    { label: "W38", created: 29, completed: 33 },
    { label: "W39", created: 45, completed: 38 },
    { label: "W40", created: 38, completed: 42 },
    { label: "W41", created: 51, completed: 40 },
    { label: "W42", created: 36, completed: 44 },
  ],
  teams: [
    { team: "Platform", members: 8, open: 22, inProgress: 11, capacity: 40 },
    { team: "Field Ops", members: 12, open: 38, inProgress: 14, capacity: 48 },
    { team: "Finance", members: 5, open: 12, inProgress: 6, capacity: 20 },
    { team: "Procurement", members: 6, open: 27, inProgress: 9, capacity: 30 },
    { team: "Compliance", members: 4, open: 9, inProgress: 7, capacity: 18 },
  ],
  activity: [
    { id: "a1", actor: "Priya Nair", action: "approved", target: "PO-2291 Vendor renewal", timestamp: "2026-10-17T19:42:00Z", kind: "approved" },
    { id: "a2", actor: "Marcus Lee", action: "moved to In Review", target: "OPS-1184 Warehouse audit", timestamp: "2026-10-17T18:55:00Z", kind: "updated" },
    { id: "a3", actor: "Elena Ruiz", action: "created", target: "OPS-1192 Fleet maintenance Q4", timestamp: "2026-10-17T17:10:00Z", kind: "created" },
    { id: "a4", actor: "Tom Becker", action: "commented on", target: "FIN-338 Budget reconciliation", timestamp: "2026-10-17T15:32:00Z", kind: "commented" },
    { id: "a5", actor: "Aisha Khan", action: "completed", target: "CMP-77 SOC 2 evidence upload", timestamp: "2026-10-17T13:08:00Z", kind: "completed" },
  ],
  workItems: [
    { id: "OPS-1184", title: "Warehouse safety audit", team: "Field Ops", assignee: "Marcus Lee", status: "in_review", priority: "high", dueDate: "2026-10-20", overdue: false },
    { id: "OPS-1192", title: "Fleet maintenance schedule Q4", team: "Field Ops", assignee: "Elena Ruiz", status: "open", priority: "medium", dueDate: "2026-10-28", overdue: false },
    { id: "FIN-338", title: "Budget reconciliation — September", team: "Finance", assignee: "Tom Becker", status: "in_progress", priority: "critical", dueDate: "2026-10-15", overdue: true },
    { id: "PLT-512", title: "Migrate job scheduler to new cluster", team: "Platform", assignee: "Jin Park", status: "blocked", priority: "high", dueDate: "2026-10-14", overdue: true },
    { id: "PRC-203", title: "Vendor onboarding: Atlas Logistics", team: "Procurement", assignee: "Sara Okafor", status: "in_progress", priority: "medium", dueDate: "2026-10-24", overdue: false },
    { id: "CMP-77", title: "SOC 2 evidence upload", team: "Compliance", assignee: "Aisha Khan", status: "done", priority: "low", dueDate: "2026-10-17", overdue: false },
  ],
};
