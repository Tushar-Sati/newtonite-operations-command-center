import { cva } from "class-variance-authority";
import type { Priority, WorkItemStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "border-border bg-secondary text-muted-foreground",
      info: "border-info/30 bg-info/10 text-info",
      primary: "border-primary/30 bg-primary/10 text-primary",
      warning: "border-warning/30 bg-warning/10 text-warning",
      danger: "border-destructive/30 bg-destructive/10 text-destructive",
      success: "border-success/30 bg-success/10 text-success",
    },
  },
});

type Tone = "neutral" | "info" | "primary" | "warning" | "danger" | "success";

const STATUS: Record<WorkItemStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "neutral" },
  in_progress: { label: "In progress", tone: "primary" },
  blocked: { label: "Blocked", tone: "danger" },
  in_review: { label: "In review", tone: "info" },
  done: { label: "Done", tone: "success" },
};

const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "neutral" },
  medium: { label: "Medium", tone: "info" },
  high: { label: "High", tone: "warning" },
  critical: { label: "Critical", tone: "danger" },
};

export function Badge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn(badge({ tone }), className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: WorkItemStatus }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const p = PRIORITY[priority];
  return <Badge tone={p.tone}>{p.label}</Badge>;
}
