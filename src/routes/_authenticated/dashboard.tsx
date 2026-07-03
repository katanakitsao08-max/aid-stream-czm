import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  HeartHandshake,
  Banknote,
  CheckSquare,
  Wallet,
  Clock,
  CalendarClock,
  Activity,
} from "lucide-react";
import { formatKES } from "@/lib/format";
import { ClaimProfileBanner } from "@/components/ClaimProfileBanner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — CZMT Welfare" }] }),
  component: Dashboard,
});

type Stats = {
  total_members: number;
  active_cases: number;
  open_cases: number;
  closed_cases: number;
  pending_approvals: number;
  total_approved: number;
  total_payouts: number;
  available_balance: number;
};

function Dashboard() {
  const { isReviewer } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats-v2"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
  });

  const { data: cases = [] } = useQuery({
    queryKey: ["dashboard-cases"],
    queryFn: async () => {
      const { data } = await supabase
        .from("welfare_events")
        .select("id,title,status,event_type,event_date,deadline,target_amount,contribution_per_member,beneficiary_name")
        .neq("status", "draft")
        .order("event_date", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  const { data: totals = {} } = useQuery({
    queryKey: ["dashboard-totals"],
    queryFn: async () => {
      const { data } = await supabase.rpc("event_totals");
      const t: Record<string, { collected: number; contributors: number }> = {};
      (data ?? []).forEach((c: any) => {
        t[c.event_id] = { collected: Number(c.collected ?? 0), contributors: Number(c.contributor_count ?? 0) };
      });
      return t;
    },
  });

  const { data: recent = [] } = useQuery({
    queryKey: ["dashboard-recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contributions")
        .select("id,amount,status,created_at,payment_date,event:welfare_events(title),contributor:profiles!contributions_contributor_id_fkey(full_name)")
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  const upcoming = cases
    .filter((c: any) => c.deadline && c.status === "active")
    .sort((a: any, b: any) => a.deadline.localeCompare(b.deadline))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Live overview of welfare cases, approvals and balance.</p>
      </div>

      <ClaimProfileBanner />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total members" value={stats?.total_members ?? "—"} />
        <StatCard icon={HeartHandshake} label="Active cases" value={stats?.active_cases ?? "—"} accent="warning" />
        <StatCard icon={CheckSquare} label="Pending approvals" value={stats?.pending_approvals ?? "—"} accent="warning" />
        <StatCard icon={Banknote} label="Total approved (KES)" value={formatKES(stats?.total_approved ?? 0)} accent="success" />
        <StatCard icon={Wallet} label="Total payouts" value={formatKES(stats?.total_payouts ?? 0)} />
        <StatCard icon={Activity} label="Available balance" value={formatKES(stats?.available_balance ?? 0)} accent="success" />
        <StatCard icon={HeartHandshake} label="Open cases" value={stats?.open_cases ?? "—"} />
        <StatCard icon={HeartHandshake} label="Closed cases" value={stats?.closed_cases ?? "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartHandshake className="h-4 w-4 text-accent" /> Active welfare cases
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cases.length === 0 ? (
              <EmptyState label="No welfare cases yet." />
            ) : (
              <ul className="divide-y divide-border">
                {cases.map((e: any) => {
                  const t = totals[e.id];
                  const target = Number(e.target_amount ?? 0);
                  const collected = t?.collected ?? 0;
                  const pct = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;
                  return (
                    <li key={e.id} className="py-3">
                      <Link to="/events/$id" params={{ id: e.id }} className="block space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-medium">{e.title}</p>
                          <Badge variant={e.status === "active" ? "default" : "secondary"}>{e.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {e.beneficiary_name ? `${e.beneficiary_name} · ` : ""}
                          {e.contribution_per_member ? `KES ${formatKES(Number(e.contribution_per_member))} per member` : e.event_type}
                        </p>
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground">
                            {formatKES(collected)}{target > 0 ? ` / ${formatKES(target)}` : ""}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-accent" /> Upcoming deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState label="No upcoming deadlines." />
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((c: any) => (
                  <li key={c.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <Link to="/events/$id" params={{ id: c.id }} className="truncate font-medium hover:underline">
                        {c.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">Deadline {c.deadline}</p>
                    </div>
                    <Badge variant="outline">{c.event_type}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-accent" /> Recent contributions
            {isReviewer && stats && stats.pending_approvals > 0 && (
              <Link to="/approvals" className="ml-auto text-xs text-accent hover:underline">
                {stats.pending_approvals} awaiting review →
              </Link>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState label="No contributions submitted yet." />
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.contributor?.full_name ?? "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.event?.title ?? "—"} · {c.payment_date ?? c.created_at?.slice(0, 10)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{formatKES(Number(c.amount))}</span>
                    <StatusPill status={c.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, accent = "accent",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  accent?: "accent" | "success" | "warning";
}) {
  const color =
    accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : "text-accent";
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className={`rounded-md bg-muted p-3 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{label}</p>;
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    approved: { label: "Approved", className: "bg-success/15 text-success border-success/30" },
    confirmed: { label: "Approved", className: "bg-success/15 text-success border-success/30" },
    pending: { label: "Pending", className: "bg-warning/15 text-warning border-warning/30" },
    verification_requested: { label: "Verify", className: "bg-warning/15 text-warning border-warning/30" },
    rejected: { label: "Rejected", className: "bg-destructive/15 text-destructive border-destructive/30" },
    not_paid: { label: "Not paid", className: "bg-muted text-muted-foreground border-border" },
  };
  const s = map[status] ?? map.not_paid;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}
