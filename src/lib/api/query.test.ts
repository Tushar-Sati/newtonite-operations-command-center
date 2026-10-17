import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

describe("dashboard query integration", () => {
  it("fetches the backend contract and returns adapted dashboard data", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    vi.resetModules();
    const response = {
      kpis: { open_items: 1, in_progress_items: 0, overdue_items: 0, pending_approvals: 0, deltas: { open: 0, in_progress: 0, overdue: 0, approvals: 0 } },
      weekly: [], teams: [{ team_id: "t-1", team: "Platform", members: 1, open: 1, in_progress: 0, capacity: 4 }],
      activity: [], work_items: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { dashboardQueryOptions } = await import("./dashboard");
    const queryClient = new QueryClient();
    const result = await queryClient.fetchQuery(dashboardQueryOptions);
    expect(result.kpis.openItems).toBe(1);
    expect(result.teams[0]?.teamId).toBe("t-1");
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/dashboard", expect.any(Object));
    queryClient.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});
