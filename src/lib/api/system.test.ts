import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("backend health query", () => {
  it("reads the real health response without sending a user token", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    window.sessionStorage.setItem("newtonite.access-token", "user-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok", database: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { fetchHealth } = await import("./system");

    await expect(fetchHealth()).resolves.toEqual({ status: "ok", database: "ok" });
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/health", expect.objectContaining({ method: "GET" }));
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toBeInstanceOf(Headers);
    expect(((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers).has("Authorization")).toBe(false);
  });

  it("rejects malformed health responses instead of presenting them as healthy", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok", database: "offline" }), { status: 200 })));
    const { fetchHealth } = await import("./system");

    await expect(fetchHealth()).rejects.toMatchObject({ code: "invalid_response" });
  });
});
