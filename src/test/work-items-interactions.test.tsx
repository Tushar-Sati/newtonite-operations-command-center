import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("Work Items interactions", () => {
  it("opens details and claims an item through the team-scoped API", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    vi.resetModules();
    window.sessionStorage.setItem("newtonite.access-token", "test-token");
    const item = {
      id: "record-1",
      key: "OPS-1",
      title: "Review shipment",
      description: null,
      team_id: "team-1",
      assignee_id: null,
      status: "open",
      priority: "high",
      due_date: null,
      version: 1,
      created_at: "2026-10-18T10:00:00Z",
      updated_at: "2026-10-18T10:00:00Z",
    };
    const dashboard = {
      kpis: {
        open_items: 1,
        in_progress_items: 0,
        overdue_items: 0,
        pending_approvals: 0,
        deltas: { open: 0, in_progress: 0, overdue: 0, approvals: 0 },
      },
      weekly: [],
      teams: [
        { team_id: "team-1", team: "Platform", members: 1, open: 1, in_progress: 0, capacity: 4 },
      ],
      activity: [],
      work_items: [
        {
          id: item.key,
          title: item.title,
          team: "Platform",
          assignee: "Unassigned",
          status: "open",
          priority: "high",
          due_date: null,
          overdue: false,
        },
      ],
    };
    let claimAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/dashboard"))
        return new Response(JSON.stringify(dashboard), { status: 200 });
      if (url.endsWith("/teams"))
        return new Response(
          JSON.stringify([
            { id: "team-1", name: "Platform", capacity: 4, role: "manager", member_count: 1 },
          ]),
          { status: 200 },
        );
      if (url.includes("/members"))
        return new Response(
          JSON.stringify([{ user_id: "user-1", full_name: "Alex Operator", role: "manager" }]),
          { status: 200 },
        );
      if (url.includes("/activity?")) return new Response(JSON.stringify([]), { status: 200 });
      if (url.includes("/claim")) {
        claimAttempts += 1;
        if (claimAttempts === 1)
          return new Response(
            JSON.stringify({
              error: { code: "work_item_already_claimed", message: "Already claimed" },
            }),
            { status: 409 },
          );
        return new Response(
          JSON.stringify({ ...item, assignee_id: "user-1", status: "in_progress", version: 2 }),
          { status: 200 },
        );
      }
      if (url.endsWith("/record-1")) return new Response(JSON.stringify(item), { status: 200 });
      if (url.includes("/work-items?"))
        return new Response(JSON.stringify([item]), { status: 200 });
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { WorkItemsPage } = await import("../routes/work-items.lazy");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkItemsPage />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Claim work" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url).includes("/claim") && init?.method === "POST",
        ),
      ).toBe(true),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This item changed or was claimed by someone else",
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).includes("/work-items?")).length,
      ).toBeGreaterThan(1),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Claim work" }));
    await waitFor(() => expect(claimAttempts).toBe(2));
    fireEvent.click(await screen.findByRole("button", { name: "Open OPS-1: Review shipment" }));
    expect(await screen.findByText("Current details from the backend.")).toBeInTheDocument();

    queryClient.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("creates with an idempotency key and edits using the displayed version", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    vi.resetModules();
    window.sessionStorage.setItem("newtonite.access-token", "test-token");
    const item = {
      id: "record-1",
      key: "OPS-1",
      title: "Review shipment",
      description: null,
      team_id: "team-1",
      assignee_id: null,
      status: "open",
      priority: "high",
      due_date: null,
      version: 3,
      created_at: "2026-10-18T10:00:00Z",
      updated_at: "2026-10-18T10:00:00Z",
    };
    const dashboard = {
      kpis: {
        open_items: 1,
        in_progress_items: 0,
        overdue_items: 0,
        pending_approvals: 0,
        deltas: { open: 0, in_progress: 0, overdue: 0, approvals: 0 },
      },
      weekly: [],
      teams: [
        { team_id: "team-1", team: "Platform", members: 1, open: 1, in_progress: 0, capacity: 4 },
      ],
      activity: [],
      work_items: [],
    };
    let current = item;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/dashboard"))
        return new Response(JSON.stringify(dashboard), { status: 200 });
      if (url.endsWith("/teams"))
        return new Response(
          JSON.stringify([
            { id: "team-1", name: "Platform", capacity: 4, role: "manager", member_count: 1 },
          ]),
          { status: 200 },
        );
      if (url.includes("/members"))
        return new Response(
          JSON.stringify([{ user_id: "user-1", full_name: "Alex Operator", role: "manager" }]),
          { status: 200 },
        );
      if (url.includes("/activity?")) return new Response(JSON.stringify([]), { status: 200 });
      if (url.includes("/work-items") && init?.method === "POST") {
        return new Response(
          JSON.stringify({ ...item, id: "record-2", key: "OPS-2", title: "New task" }),
          { status: 201 },
        );
      }
      if (url.endsWith("/record-1") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { expected_version: number; title: string };
        current = { ...current, ...body, version: 4 };
        return new Response(JSON.stringify(current), { status: 200 });
      }
      if (url.endsWith("/record-1")) return new Response(JSON.stringify(current), { status: 200 });
      if (url.includes("/work-items?"))
        return new Response(JSON.stringify([current]), { status: 200 });
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { WorkItemsPage } = await import("../routes/work-items.lazy");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkItemsPage />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Create work item" }));
    fireEvent.change(await screen.findByLabelText("Key"), { target: { value: "OPS-2" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New task" } });
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes("/teams/team-1/work-items") && init?.method === "POST",
        ),
      ).toBe(true),
    );
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes("/teams/team-1/work-items") && init?.method === "POST",
    );
    expect(new Headers(createCall?.[1]?.headers).get("Idempotency-Key")).toBeTruthy();
    expect(await screen.findByRole("status")).toHaveTextContent("Work item created.");

    fireEvent.click(await screen.findByRole("button", { name: "Open OPS-1: Review shipment" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit work item" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Revised shipment review" },
    });
    fireEvent.change(screen.getByLabelText("Workflow state"), { target: { value: "in_progress" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url).endsWith("/record-1") && init?.method === "PATCH",
        ),
      ).toBe(true),
    );
    const updateCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/record-1") && init?.method === "PATCH",
    );
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({
      expected_version: 3,
      title: "Revised shipment review",
      status: "in_progress",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Work item updated.");

    queryClient.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("closes a stale edit and displays refreshed server data after a 409", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    vi.resetModules();
    window.sessionStorage.setItem("newtonite.access-token", "test-token");
    const stale = {
      id: "record-1",
      key: "OPS-1",
      title: "Original title",
      description: null,
      team_id: "team-1",
      assignee_id: null,
      status: "open",
      priority: "high",
      due_date: null,
      version: 1,
      created_at: "2026-10-18T10:00:00Z",
      updated_at: "2026-10-18T10:00:00Z",
    };
    const latest = { ...stale, title: "Changed by teammate", version: 2 };
    const dashboard = {
      kpis: {
        open_items: 1,
        in_progress_items: 0,
        overdue_items: 0,
        pending_approvals: 0,
        deltas: { open: 0, in_progress: 0, overdue: 0, approvals: 0 },
      },
      weekly: [],
      teams: [
        { team_id: "team-1", team: "Platform", members: 1, open: 1, in_progress: 0, capacity: 4 },
      ],
      activity: [],
      work_items: [],
    };
    let refreshed = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/dashboard"))
        return new Response(JSON.stringify(dashboard), { status: 200 });
      if (url.endsWith("/teams"))
        return new Response(
          JSON.stringify([
            { id: "team-1", name: "Platform", capacity: 4, role: "manager", member_count: 1 },
          ]),
          { status: 200 },
        );
      if (url.includes("/members"))
        return new Response(
          JSON.stringify([{ user_id: "user-1", full_name: "Alex Operator", role: "manager" }]),
          { status: 200 },
        );
      if (url.includes("/activity?")) return new Response(JSON.stringify([]), { status: 200 });
      if (url.endsWith("/record-1") && init?.method === "PATCH") {
        refreshed = true;
        return new Response(
          JSON.stringify({ error: { code: "stale_version", message: "The item changed" } }),
          { status: 409 },
        );
      }
      if (url.endsWith("/record-1"))
        return new Response(JSON.stringify(refreshed ? latest : stale), { status: 200 });
      if (url.includes("/work-items?"))
        return new Response(JSON.stringify([stale]), { status: 200 });
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { WorkItemsPage } = await import("../routes/work-items.lazy");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkItemsPage />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Open OPS-1: Original title" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit work item" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "My stale title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This item was changed by someone else",
    );
    expect(await screen.findByText("Changed by teammate")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    queryClient.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });
});
