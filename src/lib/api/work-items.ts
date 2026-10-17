import { queryOptions } from "@tanstack/react-query";
import { getWorkItem, listWorkItems } from "./client";

export const workItemsQueryOptions = (teamId: string, status: string, offset: number) => queryOptions({
  queryKey: ["work-items", teamId, status, offset],
  queryFn: () => listWorkItems(teamId, { ...(status ? { status } : {}), limit: 20, offset }),
  enabled: Boolean(teamId),
});

export const workItemQueryOptions = (teamId: string, itemId: string) => queryOptions({
  queryKey: ["work-item", teamId, itemId],
  queryFn: () => getWorkItem(teamId, itemId),
  enabled: Boolean(teamId && itemId),
});
