import { describe, expect, it } from "vitest";
import type { TeamWorkload, WorkItemRecord } from "@/lib/api/types";
import { getNetworkSignal, networkNodeSize, networkPosition, recentActivityIntensity } from "./network-model";

const team: TeamWorkload = { teamId: "team-a", team: "Field operations", members: 8, open: 2, inProgress: 2, capacity: 10 };

function item(overrides: Partial<WorkItemRecord> = {}): WorkItemRecord {
  return {
    id: "item-1", key: "OPS-1", title: "Inspect relay", description: null, team_id: team.teamId, assignee_id: null,
    status: "open", priority: "medium", due_date: null, version: 1,
    created_at: "2026-10-18T10:00:00Z", updated_at: "2026-10-18T10:00:00Z", ...overrides,
  };
}

describe("operations network signal model", () => {
  it("maps ordinary team load to calm cyan status", () => {
    expect(getNetworkSignal(team, [item()])).toMatchObject({ signal: "healthy", load: 0.4, overdue: 0 });
  });

  it("maps blocked work, approval work, near-capacity teams, and unavailable reads to attention", () => {
    expect(getNetworkSignal({ ...team, open: 7, inProgress: 1 }, [item()]).signal).toBe("attention");
    expect(getNetworkSignal(team, [item({ status: "blocked" })]).signal).toBe("attention");
    expect(getNetworkSignal(team, [item({ status: "in_review" })]).signal).toBe("attention");
    expect(getNetworkSignal(team, undefined, true).signal).toBe("attention");
  });

  it("maps observed overdue work and overload to critical status", () => {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    expect(getNetworkSignal(team, [item({ due_date: yesterday.toISOString().slice(0, 10) })])).toMatchObject({ signal: "critical", overdue: 1 });
    expect(getNetworkSignal({ ...team, open: 9, inProgress: 2 }, [])).toMatchObject({ signal: "critical", load: 1.1 });
  });

  it("places team nodes on a consistent illustrative sphere", () => {
    const points = Array.from({ length: 8 }, (_, index) => networkPosition(index, 8));
    expect(points).toHaveLength(8);
    for (const point of points) expect(Math.hypot(...point)).toBeCloseTo(1.51, 5);
  });

  it("maps recent API activity to pulse intensity and stronger risk signals to larger markers", () => {
    const now = Date.now();
    const events = Array.from({ length: 10 }, (_, index) => ({
      id: `event-${index}`, actor: "Synthetic operator", action: "updated work item",
      kind: "updated" as const, occurred_at: new Date(now - index * 60_000).toISOString(),
      work_item: null,
    }));
    expect(recentActivityIntensity(events, now)).toBeCloseTo(10 / 15);
    expect(recentActivityIntensity(undefined, now)).toBe(0);
    expect(networkNodeSize(0.8, "critical")).toBeGreaterThan(networkNodeSize(0.4, "healthy"));
  });
});
