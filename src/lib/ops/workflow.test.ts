import { describe, expect, it } from "vitest";
import { allowedWorkItemTransitions, dueRisk, filterActivity, filterWorkItems, prioritizeApprovals, sortWorkItems } from "./workflow";
import type { ActivityRecordData, WorkItemRecord } from "@/lib/api/types";

const item = (key: string, values: Partial<WorkItemRecord> = {}): WorkItemRecord => ({
  id: key, key, title: `Work ${key}`, description: null, team_id: "team-a", assignee_id: null,
  status: "open", priority: "medium", due_date: null, version: 1,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...values,
});

describe("operator workflow helpers", () => {
  it("marks due dates at risk and ignores completed work", () => {
    expect(dueRisk(item("late", { due_date: "2026-01-01" }), "2026-01-02")).toBe("overdue");
    expect(dueRisk(item("today", { due_date: "2026-01-02" }), "2026-01-02")).toBe("due_today");
    expect(dueRisk(item("closed", { due_date: "2026-01-01", status: "done" }), "2026-01-02")).toBe("none");
  });

  it("filters the board and orders work by priority or due date", () => {
    const rows = [item("later", { due_date: "2999-05-20", priority: "low" }), item("urgent", { due_date: "2999-05-01", priority: "critical", title: "Pump inspection" })];
    expect(filterWorkItems(rows, { query: "pump", priority: "critical" }).map((row) => row.key)).toEqual(["urgent"]);
    expect(filterWorkItems(rows, { due: "at_risk" },).length).toBe(0);
    expect(sortWorkItems(rows, "priority")[0]?.key).toBe("urgent");
    expect(sortWorkItems(rows, "due")[0]?.key).toBe("urgent");
  });

  it("prioritizes critical approval work and filters the audit page by category and actor", () => {
    const rows = [item("old", { created_at: "2026-01-01T00:00:00Z" }), item("urgent", { priority: "critical", created_at: "2026-02-01T00:00:00Z" })];
    expect(prioritizeApprovals(rows)[0]?.key).toBe("urgent");
    const events: ActivityRecordData[] = [
      { id: "a", actor: "Ada", action: "claimed", kind: "claimed", occurred_at: "2026-01-01T00:00:00Z", work_item: null },
      { id: "b", actor: "Lin", action: "approved", kind: "approved", occurred_at: "2026-01-02T00:00:00Z", work_item: null },
    ];
    expect(filterActivity(events, "approved", "lin").map((event) => event.id)).toEqual(["b"]);
  });

  it("keeps approval completion out of ordinary workflow transitions", () => {
    expect(allowedWorkItemTransitions("in_review")).toEqual(["in_progress"]);
    expect(allowedWorkItemTransitions("done")).toEqual([]);
  });
});
