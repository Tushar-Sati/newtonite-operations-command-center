import { Link, Navigate, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, AlertTriangle, ChevronsLeft, ChevronsRight, LayoutDashboard, ListTodo, Menu, Search, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/common/Button";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ErrorState, Skeleton } from "@/components/common/States";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { healthQueryOptions } from "@/lib/api/system";

function Sidebar({ collapsed, onToggle, mobileOpen, onClose }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onClose: () => void }) {
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-background/70 md:hidden" onClick={onClose} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border/80 bg-[color-mix(in_oklch,var(--surface)_92%,transparent)] shadow-2xl shadow-black/25 backdrop-blur-2xl transition-[width,transform] duration-200",
          collapsed ? "md:w-16" : "md:w-60",
          "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex min-h-[76px] items-center gap-3 border-b border-border/70 px-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-sm font-bold text-primary shadow-[0_0_24px_-8px_var(--primary)]">N</div>
          <div className={cn("min-w-0", collapsed && "md:hidden")}>
            <p className="truncate text-[13px] font-semibold tracking-tight">Newtonite <span className="text-muted-foreground">Operations</span></p>
            <p className="mt-1 font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-primary">Global logistics · infrastructure</p>
          </div>
        </div>
        <div className={cn("px-4 pb-2 pt-6 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/65", collapsed && "md:hidden")}>Command modules</div>
        <nav className="flex-1 space-y-1 px-2 pb-4" aria-label="Main">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              title={collapsed ? label : undefined}
              activeOptions={{ exact: to === "/" }}
              className="group relative flex h-11 items-center gap-3 rounded-lg px-3 text-[13px] text-muted-foreground transition-all duration-200 hover:bg-white/[0.035] hover:text-foreground data-[status=active]:bg-accent/75 data-[status=active]:text-foreground"
            >
              <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r bg-primary opacity-0 shadow-[0_0_10px_var(--primary)] transition-opacity group-data-[status=active]:opacity-100" />
              <Icon className="h-4 w-4 shrink-0 transition-colors group-data-[status=active]:text-primary" />
              <span className={cn("truncate", collapsed && "md:hidden")}>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-border/70 p-2 md:block">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
          </Button>
        </div>
        <div className={cn("border-t border-border/70 px-4 py-4", collapsed && "md:hidden")}><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">Operations network</p><p className="mt-1 text-[11px] text-muted-foreground">Coordinated · team scoped</p></div>
      </aside>
    </>
  );
}

function Topbar({ onMenu, userName, onLogout }: { onMenu: () => void; userName: string; onLogout: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const health = useQuery(healthQueryOptions);
  const title = NAV_ITEMS.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)))?.label ?? "Newtonite";
  const initials = userName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
  const healthy = health.data?.status === "ok" && health.data.database === "ok";
  const healthLabel = health.isPending ? "Connecting" : healthy ? "All systems normal" : health.error instanceof Error && "code" in health.error && health.error.code === "configuration_error" ? "API not configured" : "System degraded";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function goTo(path: (typeof NAV_ITEMS)[number]["to"]) {
    setPaletteOpen(false);
    void navigate({ to: path });
  }

  return (
    <header className="sticky top-0 z-20 flex h-[68px] items-center gap-3 border-b border-border/70 bg-[color-mix(in_oklch,var(--background)_78%,transparent)] px-4 backdrop-blur-2xl md:px-8">
      <Button variant="ghost" size="icon" className="text-muted-foreground md:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu className="h-4 w-4" />
      </Button>
      <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold tracking-wide">{title}</p><p className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground sm:block">Newtonite / operations control</p></div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="hidden h-9 w-52 items-center gap-2 rounded-lg border border-border/80 bg-white/[0.025] px-3 text-xs text-muted-foreground transition-all hover:border-primary/40 hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:flex lg:w-64"
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search modules and actions</span>
          <kbd className="rounded border border-border bg-background/80 px-1.5 py-0.5 font-mono text-[9px]">CTRL K</kbd>
        </button>
        <Button variant="ghost" size="icon" className="text-muted-foreground md:hidden" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
          <Search className="h-4 w-4" />
        </Button>
        <span className="hidden items-center gap-2 border-l border-border/70 pl-4 sm:flex" aria-live="polite" title={`Backend and database health: ${healthLabel}`}>
          <span className={cn("h-2 w-2 rounded-full", health.isPending ? "animate-pulse bg-warning" : healthy ? "status-pulse bg-success" : "bg-destructive")} />
          <span className="hidden text-[11px] font-medium text-muted-foreground lg:inline">{healthLabel}</span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60 lg:hidden">SYS</span>
        </span>
        <div className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2">
          <div aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-primary">{initials}</div>
          <div className="hidden leading-tight lg:block">
            <p className="text-sm font-medium">{userName}</p>
            <p className="text-xs text-muted-foreground">Signed in</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout}>Sign out</Button>
        </div>
      </div>
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Search modules or actions…" aria-label="Search command palette" />
        <CommandList>
          <CommandEmpty>No command found.</CommandEmpty>
          <CommandGroup heading="Navigate">
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => <CommandItem key={to} value={`${label} ${to}`} onSelect={() => goTo(to)}><Icon className="h-4 w-4" />{label}<CommandShortcut>{to === "/" ? "HOME" : "OPEN"}</CommandShortcut></CommandItem>)}
          </CommandGroup>
          <CommandGroup heading="Operations">
            <CommandItem value="review work queue open work items" onSelect={() => goTo("/work-items")}><ListTodo className="h-4 w-4" />Review active work<CommandShortcut>QUEUE</CommandShortcut></CommandItem>
            <CommandItem value="audit activity log" onSelect={() => goTo("/activity")}><Activity className="h-4 w-4" />Open event log<CommandShortcut>AUDIT</CommandShortcut></CommandItem>
          </CommandGroup>
          <div className="border-t border-border/70 px-4 py-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Search covers available modules · Work item search is not connected</div>
        </CommandList>
      </CommandDialog>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { ready, user, error, retry, logout } = useAuth();
  if (pathname === "/login") return <>{children}</>;
  if (!ready) return <div className="min-h-screen p-6"><Skeleton className="h-14" /><Skeleton className="mt-6 h-80" /></div>;
  if (error) return <div className="mx-auto max-w-xl p-8"><ErrorState message={error} onRetry={retry} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className={cn("transition-[padding] duration-200", collapsed ? "md:pl-16" : "md:pl-60")}>
        <Topbar onMenu={() => setMobileOpen(true)} userName={user.full_name} onLogout={logout} />
        <main className="mx-auto max-w-[1680px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
