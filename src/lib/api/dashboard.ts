// Data access for the Operations Dashboard.
// UI components never import mock data directly — they go through this module.
// To integrate FastAPI: set VITE_API_BASE_URL and the fetch below takes over.
import { queryOptions } from "@tanstack/react-query";
import { MOCK_DASHBOARD } from "./mock-data";
import type { DashboardData } from "./types";

const API_BASE = import.meta.env["VITE_API_BASE_URL"] as string | undefined;

export async function fetchDashboard(): Promise<DashboardData> {
  if (API_BASE) {
    const res = await fetch(`${API_BASE}/dashboard`);
    if (!res.ok) throw new Error(`Dashboard request failed (${res.status})`);
    return (await res.json()) as DashboardData;
  }
  // TEMPORARY: mock data with simulated latency.
  await new Promise((r) => setTimeout(r, 400));
  return MOCK_DASHBOARD;
}

export const isUsingMockData = !API_BASE;

export const dashboardQueryOptions = queryOptions({
  queryKey: ["dashboard"],
  queryFn: fetchDashboard,
});
