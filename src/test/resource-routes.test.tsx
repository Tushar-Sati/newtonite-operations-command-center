import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); window.sessionStorage.clear();
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.sessionStorage.setItem("newtonite.access-token", "test-token");
  return queryClient;
}

describe("live resource route integrations", () => {
  it("loads member-safe team and membership records", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test"); vi.resetModules();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/teams")) return new Response(JSON.stringify([{ id: "team-1", name: "Platform", capacity: 8, role: "member", member_count: 1 }]), { status: 200 });
      return new Response(JSON.stringify([{ user_id: "user-1", full_name: "Alex Member", role: "member" }]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { TeamsPage } = await import("../routes/teams");
    const queryClient = setup();
    render(<QueryClientProvider client={queryClient}><TeamsPage /></QueryClientProvider>);
    expect(await screen.findByText("Platform members")).toBeInTheDocument();
    expect(await screen.findByText("Alex Member")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/teams/team-1/members"))).toBe(true);
    queryClient.clear();
  });

  it("loads team-scoped activity records", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test"); vi.resetModules();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/teams")) return new Response(JSON.stringify([{ id: "team-1", name: "Platform", capacity: 8, role: "manager", member_count: 1 }]), { status: 200 });
      return new Response(JSON.stringify([{ id: "event-1", actor: "Alex Member", action: "claimed work item", kind: "claimed", occurred_at: "2026-10-18T10:00:00Z", work_item: { id: "item-1", key: "OPS-1", title: "Review shipment" } }]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { ActivityPage } = await import("../routes/activity");
    const queryClient = setup();
    render(<QueryClientProvider client={queryClient}><ActivityPage /></QueryClientProvider>);
    expect(await screen.findByText("claimed work item")).toBeInTheDocument();
    expect(await screen.findByText("OPS-1 · Review shipment")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/teams/team-1/activity?limit=20&offset=0"))).toBe(true);
    queryClient.clear();
  });

  it("approves using the loaded version and refreshes the queue", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test"); vi.resetModules();
    const pending = { id: "item-1", key: "OPS-1", title: "Review shipment", description: null, team_id: "team-1", assignee_id: null, status: "in_review", priority: "high", due_date: null, version: 4, created_at: "2026-10-18T10:00:00Z", updated_at: "2026-10-18T10:00:00Z" };
    let isApproved = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/teams")) return new Response(JSON.stringify([{ id: "team-1", name: "Platform", capacity: 8, role: "manager", member_count: 1 }]), { status: 200 });
      if (url.endsWith("/approve") && init?.method === "POST") { isApproved = true; return new Response(JSON.stringify({ ...pending, status: "done", version: 5 }), { status: 200 }); }
      if (url.endsWith("/approvals")) return new Response(JSON.stringify(isApproved ? [] : [pending]), { status: 200 });
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { ApprovalsPage } = await import("../routes/approvals");
    const queryClient = setup();
    render(<QueryClientProvider client={queryClient}><ApprovalsPage /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/approvals/item-1/approve") && init?.method === "POST")).toBe(true));
    const approveCall = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/approvals/item-1/approve") && init?.method === "POST");
    expect(JSON.parse(String(approveCall?.[1]?.body))).toEqual({ expected_version: 4 });
    expect(await screen.findByRole("status")).toHaveTextContent("Work item approved and marked done.");
    expect(await screen.findByText("No pending approvals")).toBeInTheDocument();
    queryClient.clear();
  });

  it("explains that members cannot approve items", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test"); vi.resetModules();
    const pending = { id: "item-1", key: "OPS-1", title: "Review shipment", description: null, team_id: "team-1", assignee_id: null, status: "in_review", priority: "high", due_date: null, version: 1, created_at: "2026-10-18T10:00:00Z", updated_at: "2026-10-18T10:00:00Z" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith("/teams")
      ? new Response(JSON.stringify([{ id: "team-1", name: "Platform", capacity: 8, role: "member", member_count: 1 }]), { status: 200 })
      : new Response(JSON.stringify([pending]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { ApprovalsPage } = await import("../routes/approvals");
    const queryClient = setup();
    render(<QueryClientProvider client={queryClient}><ApprovalsPage /></QueryClientProvider>);
    expect(await screen.findByText("Manager or admin required")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    queryClient.clear();
  });
});
