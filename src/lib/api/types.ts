import { z } from "zod";

export const WorkItemStatusSchema = z.enum(["open", "in_progress", "blocked", "in_review", "done"]);
export const PrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export type WorkItemStatus = z.infer<typeof WorkItemStatusSchema>;
export type Priority = z.infer<typeof PrioritySchema>;

const KpiSummarySchema = z.object({
  open_items: z.number(),
  in_progress_items: z.number(),
  overdue_items: z.number(),
  pending_approvals: z.number(),
  deltas: z.object({ open: z.number(), in_progress: z.number(), overdue: z.number(), approvals: z.number() }),
});
const WeeklySchema = z.object({ label: z.string(), created: z.number(), completed: z.number() });
const TeamSchema = z.object({ team_id: z.string(), team: z.string(), members: z.number(), open: z.number(), in_progress: z.number(), capacity: z.number() });
const ActivitySchema = z.object({ id: z.string(), actor: z.string(), action: z.string(), target: z.string(), timestamp: z.string(), kind: z.string() });
const DashboardItemSchema = z.object({
  id: z.string(), title: z.string(), team: z.string(), assignee: z.string(),
  status: WorkItemStatusSchema, priority: PrioritySchema, due_date: z.string().nullable(), overdue: z.boolean(),
});
export const DashboardResponseSchema = z.object({
  kpis: KpiSummarySchema, weekly: z.array(WeeklySchema), teams: z.array(TeamSchema),
  activity: z.array(ActivitySchema), work_items: z.array(DashboardItemSchema),
});

export const WorkItemResponseSchema = z.object({
  id: z.string(), key: z.string(), title: z.string(), description: z.string().nullable(),
  team_id: z.string(), assignee_id: z.string().nullable(), status: WorkItemStatusSchema,
  priority: PrioritySchema, due_date: z.string().nullable(), version: z.number().int().positive(),
  created_at: z.string(), updated_at: z.string(),
});
export const TeamRoleSchema = z.enum(["admin", "manager", "member", "viewer"]);
export const TeamResponseSchema = z.object({ id: z.string(), name: z.string(), capacity: z.number(), role: TeamRoleSchema, member_count: z.number() });
export const TeamMemberResponseSchema = z.object({ user_id: z.string(), full_name: z.string(), role: TeamRoleSchema });
export const ActivityRecordResponseSchema = z.object({
  id: z.string(), actor: z.string(), action: z.string(), kind: z.enum(["created", "updated", "claimed", "approved"]),
  occurred_at: z.string(), work_item: z.object({ id: z.string(), key: z.string(), title: z.string() }).nullable(),
});
export const UserResponseSchema = z.object({ id: z.string(), email: z.string().email(), full_name: z.string() });
export const TokenResponseSchema = z.object({ access_token: z.string().min(1), token_type: z.literal("bearer"), expires_in: z.number().positive() });
export const ApiErrorResponseSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export interface WorkItem {
  id: string;
  recordId?: string;
  title: string;
  team: string;
  assignee: string;
  status: WorkItemStatus;
  priority: Priority;
  dueDate: string;
  overdue: boolean;
}
export interface KpiSummary {
  openItems: number;
  inProgressItems: number;
  overdueItems: number;
  pendingApprovals: number;
  deltas: { open: number; inProgress: number; overdue: number; approvals: number };
}
export interface TeamWorkload { teamId: string; team: string; members: number; open: number; inProgress: number; capacity: number }
export interface WeeklyWorkload { label: string; created: number; completed: number }
export interface ActivityEvent {
  id: string; actor: string; action: string; target: string; timestamp: string;
  kind: "created" | "updated" | "approved" | "commented" | "completed";
}
export interface DashboardData {
  kpis: KpiSummary; weekly: WeeklyWorkload[]; teams: TeamWorkload[];
  activity: ActivityEvent[]; workItems: WorkItem[];
}
export type WorkItemRecord = z.infer<typeof WorkItemResponseSchema>;
export type TeamRecord = z.infer<typeof TeamResponseSchema>;
export type TeamMemberRecord = z.infer<typeof TeamMemberResponseSchema>;
export type ActivityRecordData = z.infer<typeof ActivityRecordResponseSchema>;
export type User = z.infer<typeof UserResponseSchema>;
export type ApiErrorEnvelope = z.infer<typeof ApiErrorResponseSchema>;
