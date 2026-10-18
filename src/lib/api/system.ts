import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requestJson } from "./client";

export const HealthResponseSchema = z.object({ status: z.literal("ok"), database: z.literal("ok") });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson("/health", HealthResponseSchema, { token: null });
}

export const healthQueryOptions = queryOptions({
  queryKey: ["system-health"],
  queryFn: fetchHealth,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
  retry: 1,
});
