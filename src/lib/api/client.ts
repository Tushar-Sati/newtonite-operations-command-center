import { z } from "zod";
import { ActivityRecordResponseSchema, ApiErrorResponseSchema, TeamMemberResponseSchema, TeamResponseSchema, TokenResponseSchema, UserResponseSchema, WorkItemResponseSchema, type ActivityRecordData, type TeamMemberRecord, type TeamRecord, type User, type WorkItemRecord } from "./types";

const configuredBase = import.meta.env["VITE_API_BASE_URL"] as string | undefined;
export const API_BASE_URL = configuredBase?.trim().replace(/\/+$/, "") ?? "";
const TOKEN_KEY = "newtonite.access-token";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function readAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function saveAccessToken(token: string): void {
  if (typeof window !== "undefined") window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(TOKEN_KEY);
}

async function readError(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json();
    const parsed = ApiErrorResponseSchema.safeParse(body);
    if (parsed.success) return new ApiError(parsed.data.error.message, response.status, parsed.data.error.code);
  } catch {
    // Use the status fallback when an upstream proxy returns a non-JSON error.
  }
  return new ApiError(`Request failed (${response.status})`, response.status, "http_error");
}

export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  options: { method?: string; body?: unknown; headers?: HeadersInit; token?: string | null } = {},
): Promise<T> {
  if (!API_BASE_URL) throw new ApiError("Backend URL is not configured. Set VITE_API_BASE_URL.", 0, "configuration_error");
  const token = options.token === undefined ? readAccessToken() : options.token;
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    const init: RequestInit = {
      method: options.method ?? "GET",
      headers,
    };
    if (options.body !== undefined) init.body = JSON.stringify(options.body);
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new ApiError("Could not reach the backend. Check the API URL and network connection.", 0, "network_error");
  }

  if (!response.ok) {
    const error = await readError(response);
    if (response.status === 401 && token) {
      clearAccessToken();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("newtonite:unauthorized"));
    }
    throw error;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("Backend returned invalid JSON.", response.status, "invalid_response");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError("Backend response did not match the expected schema.", response.status, "invalid_response");
  return parsed.data;
}

export async function loginRequest(email: string, password: string) {
  return requestJson("/auth/login", TokenResponseSchema, { method: "POST", body: { email, password }, token: null });
}

export async function currentUser(token?: string | null): Promise<User> {
  return requestJson("/auth/me", UserResponseSchema, token === undefined ? {} : { token });
}

export interface WorkItemListParams { status?: string; limit?: number; offset?: number }

export async function listWorkItems(teamId: string, params: WorkItemListParams = {}): Promise<WorkItemRecord[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  query.set("limit", String(params.limit ?? 20));
  query.set("offset", String(params.offset ?? 0));
  const itemsSchema = z.array(WorkItemResponseSchema);
  return requestJson(`/teams/${encodeURIComponent(teamId)}/work-items?${query}`, itemsSchema);
}

export async function getWorkItem(teamId: string, itemId: string): Promise<WorkItemRecord> {
  return requestJson(`/teams/${encodeURIComponent(teamId)}/work-items/${encodeURIComponent(itemId)}`, WorkItemResponseSchema);
}

export async function claimWorkItem(teamId: string, itemId: string): Promise<WorkItemRecord> {
  return requestJson(`/teams/${encodeURIComponent(teamId)}/work-items/${encodeURIComponent(itemId)}/claim`, WorkItemResponseSchema, { method: "POST" });
}

export interface WorkItemUpdatePayload {
  expected_version: number;
  title?: string;
  description?: string | null;
  assignee_id?: string | null;
  status?: string;
  priority?: string;
  due_date?: string | null;
}

export async function updateWorkItem(teamId: string, itemId: string, payload: WorkItemUpdatePayload): Promise<WorkItemRecord> {
  return requestJson(`/teams/${encodeURIComponent(teamId)}/work-items/${encodeURIComponent(itemId)}`, WorkItemResponseSchema, { method: "PATCH", body: payload });
}

export interface WorkItemCreatePayload {
  key: string;
  title: string;
  description?: string | null;
  assignee_id?: string | null;
  priority?: string;
  due_date?: string | null;
}

export async function createWorkItem(teamId: string, payload: WorkItemCreatePayload, idempotencyKey: string = crypto.randomUUID()): Promise<WorkItemRecord> {
  return requestJson(`/teams/${encodeURIComponent(teamId)}/work-items`, WorkItemResponseSchema, {
    method: "POST", body: payload, headers: { "Idempotency-Key": idempotencyKey },
  });
}

export async function listTeams(): Promise<TeamRecord[]> {
  return requestJson("/teams", z.array(TeamResponseSchema));
}

export async function listTeamMembers(teamId: string): Promise<TeamMemberRecord[]> {
  return requestJson(`/teams/${encodeURIComponent(teamId)}/members`, z.array(TeamMemberResponseSchema));
}

export async function listActivity(teamId: string, params: { limit?: number; offset?: number } = {}): Promise<ActivityRecordData[]> {
  const query = new URLSearchParams({ limit: String(params.limit ?? 20), offset: String(params.offset ?? 0) });
  return requestJson(`/teams/${encodeURIComponent(teamId)}/activity?${query}`, z.array(ActivityRecordResponseSchema));
}

export async function listPendingApprovals(teamId: string): Promise<WorkItemRecord[]> {
  return requestJson(`/teams/${encodeURIComponent(teamId)}/approvals`, z.array(WorkItemResponseSchema));
}

export async function approveWorkItem(teamId: string, itemId: string, expectedVersion: number): Promise<WorkItemRecord> {
  return requestJson(`/teams/${encodeURIComponent(teamId)}/approvals/${encodeURIComponent(itemId)}/approve`, WorkItemResponseSchema, {
    method: "POST", body: { expected_version: expectedVersion },
  });
}
