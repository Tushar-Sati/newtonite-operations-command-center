import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight, Menu, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/common/Button";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

function Sidebar({ collapsed, onToggle, mobileOpen, onClose }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onClose: () => void }) {
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-background/70 md:hidden" onClick={onClose} />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-surface transition-[width,transform] duration-200",
          collapsed ? "md:w-16" : "md:w-60",
          "w-60",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">N</div>
          <span className={cn("truncate text-sm font-semibold tracking-tight", collapsed && "md:hidden")}>
            Newtonite <span className="text-muted-foreground">Operations</span>
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 p-2" aria-label="Main">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              title={collapsed ? label : undefined}
              activeOptions={{ exact: to === "/" }}
              className="group flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground"
            >
              <Icon className="h-4 w-4 shrink-0 group-data-[status=active]:text-primary" />
              <span className={cn("truncate", collapsed && "md:hidden")}>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-border p-2 md:block">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
          </Button>
        </div>
      </aside>
    </>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const title = NAV_ITEMS.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)))?.label ?? "Newtonite";
  return (
    <header className="sticky top-0 z-20 grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu className="h-4 w-4" />
      </Button>
      <h1 className="truncate text-base font-semibold md:col-start-1">{title}</h1>
      <div className="flex items-center gap-2">
        {/* Search entry point — not wired to a search backend yet */}
        <button
          type="button"
          className="hidden h-9 w-64 items-center gap-2 rounded-md border border-input bg-surface px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 sm:flex"
          aria-label="Search (coming soon)"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-border px-1.5 font-mono text-[10px]">⌘K</kbd>
        </button>
        <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search">
          <Search className="h-4 w-4" />
        </Button>
        {/* Placeholder profile — no authentication implemented */}
        <div className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-primary">GU</div>
          <div className="hidden leading-tight lg:block">
            <p className="text-sm font-medium">Guest user</p>
            <p className="text-xs text-muted-foreground">Not signed in</p>
          </div>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className={cn("transition-[padding] duration-200", collapsed ? "md:pl-16" : "md:pl-60")}>
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto max-w-[1440px] p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
