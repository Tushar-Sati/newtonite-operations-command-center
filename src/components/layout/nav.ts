import { Activity, CheckSquare, LayoutDashboard, ListTodo, Users } from "lucide-react";

export const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/work-items", label: "Work Items", icon: ListTodo },
  { to: "/teams", label: "Teams", icon: Users },
  { to: "/approvals", label: "Approvals", icon: CheckSquare },
  { to: "/activity", label: "Activity", icon: Activity },
] as const;
