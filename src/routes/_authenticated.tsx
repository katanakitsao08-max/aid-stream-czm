import { createFileRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  HeartHandshake,
  Baby,
  LogOut,
  Menu,
  ShieldCheck,
  FileSpreadsheet,
  CheckSquare,
  Wallet,
  FileBarChart2,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/events", label: "Welfare Cases", icon: HeartHandshake },
  { to: "/members", label: "Members", icon: Users },
  { to: "/dependants", label: "Dependants", icon: Baby },
];

const reviewerNav = [
  { to: "/approvals", label: "Treasurer Approvals", icon: CheckSquare },
];

const adminNav = [
  { to: "/payouts", label: "Payouts", icon: Wallet },
  { to: "/reports", label: "Reports", icon: FileBarChart2 },
  { to: "/roles", label: "Role Management", icon: ShieldCheck },
  { to: "/roster", label: "Teacher Roster", icon: FileSpreadsheet },
];



function AuthLayout() {
  const { user, isLoading, profile, isAdmin, isTreasurer, isReviewer, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      navigate({ to: "/login", replace: true });
    }
  }, [user, isLoading, navigate]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform bg-sidebar text-sidebar-foreground transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <HeartHandshake className="h-5 w-5 text-sidebar-primary" />
          <span className="font-semibold tracking-tight">CZMT Welfare</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {[...nav, ...(isAdmin ? adminNav : [])].map((n) => {
            const active = location.pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-sidebar-border p-3">
          <div className="mb-2 px-1">
            <p className="truncate text-sm font-medium">{profile?.full_name ?? user.email}</p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              {isAdmin ? "Admin" : "Member"} · {profile?.school ?? "—"}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-3 border-b border-border bg-background px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-sm font-medium text-muted-foreground">
            Central Zone Malindi Teachers Welfare
          </h1>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
