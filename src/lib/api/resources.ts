import { queryOptions } from "@tanstack/react-query";
import { listActivity, listPendingApprovals, listTeamMembers, listTeams } from "./client";

export const teamsQueryOptions = () => queryOptions({
  queryKey: ["teams"],
  queryFn: listTeams,
});

export const teamMembersQueryOptions = (teamId: string) => queryOptions({
  queryKey: ["team-members", teamId],
  queryFn: () => listTeamMembers(teamId),
  enabled: Boolean(teamId),
});

export const activityQueryOptions = (teamId: string, offset: number) => queryOptions({
  queryKey: ["activity", teamId, offset],
  queryFn: () => listActivity(teamId, { limit: 20, offset }),
  enabled: Boolean(teamId),
});

export const approvalsQueryOptions = (teamId: string) => queryOptions({
  queryKey: ["approvals", teamId],
  queryFn: () => listPendingApprovals(teamId),
  enabled: Boolean(teamId),
});
