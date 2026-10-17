import { describe, expect, it } from "vitest";
import { adaptDashboard } from "./dashboard";

const backendDashboard = {
  kpis: { open_items: 3, in_progress_items: 2, overdue_items: 1, pending_approvals: 0, deltas: { open: 0, in_progress: 0, overdue: 0, approvals: 0 } },
  weekly: [{ label: "W42", created: 4, completed: 3 }],
  teams: [{ team_id: "team-uuid", team: "Platform", members: 4, open: 3, in_progress: 2, capacity: 10 }],
  activity: [{ id: "evt-1", actor: "Jo", action: "claimed", target: "OPS-1", timestamp: "2026-10-18T10:00:00Z", kind: "claimed" }],
  work_items: [{ id: "OPS-1", title: "Review", team: "Platform", assignee: "Jo", status: "in_review", priority: "high", due_date: null, overdue: false }],
};

describe("dashboard API adapter", () => {
  it("maps the backend snake_case contract into component data", () => {
    const result = adaptDashboard(backendDashboard);
    expect(result.kpis.inProgressItems).toBe(2);
    expect(result.kpis.deltas.inProgress).toBe(0);
    expect(result.teams[0]).toMatchObject({ teamId: "team-uuid", inProgress: 2 });
    expect(result.activity[0]?.kind).toBe("updated");
    expect(result.workItems[0]?.dueDate).toBe("");
  });

  it("rejects an invalid response instead of trusting an unchecked cast", () => {
    expect(() => adaptDashboard({ ...backendDashboard, kpis: { open_items: "three" } })).toThrow();
  });
});
