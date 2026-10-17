import { afterEach, describe, expect, it, vi } from "vitest";

const itemResponse = {
  id: "uuid-1", key: "OPS-1", title: "First", description: null, team_id: "team-1", assignee_id: null,
  status: "open", priority: "medium", due_date: null, version: 1,
  created_at: "2026-10-18T10:00:00Z", updated_at: "2026-10-18T10:00:00Z",
};

async function clientModule() {
  vi.resetModules();
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test/");
  return import("./client");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("typed API client", () => {
  it("sends credentials to login and validates the bearer-token response", async () => {
    const api = await clientModule();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "signed-token", token_type: "bearer", expires_in: 1800 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.loginRequest("user@example.com", "password")).resolves.toMatchObject({ access_token: "signed-token" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://api.test/auth/login");
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({ email: "user@example.com", password: "password" });
    expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers).has("Authorization")).toBe(false);
  });

  it("adds bearer authorization and parses current-user responses", async () => {
    const api = await clientModule();
    window.sessionStorage.setItem("newtonite.access-token", "token-123");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "u1", email: "a@example.com", full_name: "A Person" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.currentUser()).resolves.toMatchObject({ full_name: "A Person" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.test/auth/me");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toBeInstanceOf(Headers);
    expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers).get("Authorization")).toBe("Bearer token-123");
  });

  it("sends an idempotency key on creation and version in update payload", async () => {
    const api = await clientModule();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(itemResponse), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...itemResponse, version: 2 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.createWorkItem("team-1", { key: "OPS-1", title: "First" }, "stable-test-key");
    await api.updateWorkItem("team-1", "uuid-1", { expected_version: 1, title: "Changed" });
    const createHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers;
    expect(createHeaders.get("Idempotency-Key")).toBe("stable-test-key");
    expect(JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string)).toMatchObject({ expected_version: 1 });
  });

  it("sends server-side status and pagination filters", async () => {
    const api = await clientModule();
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await api.listWorkItems("team id", { status: "in_progress", limit: 10, offset: 20 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://api.test/teams/team%20id/work-items?status=in_progress&limit=10&offset=20");
  });

  it("validates team, activity, and approval API contracts", async () => {
    const api = await clientModule();
    const item = { id: "item-1", key: "OPS-1", title: "Task", description: null, team_id: "team-1", assignee_id: null, status: "done", priority: "high", due_date: null, version: 2, created_at: "2026-10-18T10:00:00Z", updated_at: "2026-10-18T10:00:00Z" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "team-1", name: "Platform", capacity: 5, role: "manager", member_count: 2 }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ user_id: "u1", full_name: "A Member", role: "member" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "e1", actor: "A Member", action: "approved work item", kind: "approved", occurred_at: "2026-10-18T10:00:00Z", work_item: { id: "item-1", key: "OPS-1", title: "Task" } }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([item]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(item), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.listTeams()).resolves.toMatchObject([{ id: "team-1", role: "manager" }]);
    await expect(api.listTeamMembers("team-1")).resolves.toMatchObject([{ full_name: "A Member" }]);
    await expect(api.listActivity("team-1", { limit: 5, offset: 10 })).resolves.toHaveLength(1);
    await expect(api.listPendingApprovals("team-1")).resolves.toHaveLength(1);
    await api.approveWorkItem("team-1", "item-1", 1);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe("http://api.test/teams/team-1/activity?limit=5&offset=10");
    expect(JSON.parse((fetchMock.mock.calls[4]?.[1] as RequestInit).body as string)).toEqual({ expected_version: 1 });
  });

  it("maps structured conflicts and clears an expired session token", async () => {
    const api = await clientModule();
    window.sessionStorage.setItem("newtonite.access-token", "expired");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "stale_version", message: "Reload latest item" } }), { status: 409 })));
    await expect(api.getWorkItem("team-1", "item-1")).rejects.toMatchObject({ status: 409, code: "stale_version", message: "Reload latest item" });
    expect(window.sessionStorage.getItem("newtonite.access-token")).toBe("expired");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "invalid_token", message: "Expired" } }), { status: 401 })));
    await expect(api.currentUser()).rejects.toMatchObject({ status: 401, code: "invalid_token" });
    expect(window.sessionStorage.getItem("newtonite.access-token")).toBeNull();
  });

  it("rejects invalid response payloads and reports network errors", async () => {
    const api = await clientModule();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "not a work item" }), { status: 200 })));
    await expect(api.getWorkItem("t", "i")).rejects.toMatchObject({ code: "invalid_response" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    await expect(api.getWorkItem("t", "i")).rejects.toMatchObject({ code: "network_error" });
  });
});
