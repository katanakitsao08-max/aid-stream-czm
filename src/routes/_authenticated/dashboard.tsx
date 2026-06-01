import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, HeartHandshake, Banknote, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — CZMT Welfare" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [members, events, contributions] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("welfare_events").select("id,title,status,event_type,event_date,target_amount").order("event_date", { ascending: false }),
        supabase.from("contributions").select("amount,event_id"),
      ]);
      const totalsByEvent = new Map<string, number>();
      (contributions.data ?? []).forEach((c) => {
        totalsByEvent.set(c.event_id, (totalsByEvent.get(c.event_id) ?? 0) + Number(c.amount));
      });
      const openEvents = (events.data ?? []).filter((e) => e.status === "open");
      const totalCollected = (contributions.data ?? []).reduce((s, c) => s + Number(c.amount), 0);
      return {
        memberCount: members.count ?? 0,
        openCount: openEvents.length,
        totalCollected,
        recentEvents: (events.data ?? []).slice(0, 6).map((e) => ({
          ...e,
          collected: totalsByEvent.get(e.id) ?? 0,
        })),
      };
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Welfare activity at a glance.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={Users} label="Total members" value={data?.memberCount ?? "—"} />
        <StatCard icon={AlertCircle} label="Active welfare events" value={data?.openCount ?? "—"} accent="warning" />
        <StatCard icon={Banknote} label="Total collected (KES)" value={formatKES(data?.totalCollected ?? 0)} accent="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HeartHandshake className="h-4 w-4 text-accent" /> Recent welfare events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.recentEvents.length ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentEvents.map((e) => {
                const target = Number(e.target_amount ?? 0);
                const pct = target > 0 ? Math.min(100, Math.round((e.collected / target) * 100)) : 0;
                return (
                  <li key={e.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.event_date} · {e.event_type}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm">
                        <p className="font-medium">{formatKES(e.collected)}</p>
                        {target > 0 && (
                          <p className="text-xs text-muted-foreground">of {formatKES(target)} ({pct}%)</p>
                        )}
                      </div>
                      <Badge variant={e.status === "open" ? "default" : "secondary"}>{e.status}</Badge>
                    </div>
                  </li>
                );
              })}
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
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function formatKES(n: number) {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(n);
}
