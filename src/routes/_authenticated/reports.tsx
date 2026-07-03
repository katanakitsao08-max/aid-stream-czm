import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { FileBarChart2, Download, Printer } from "lucide-react";
import { formatKES } from "@/lib/format";
import { StatusPill } from "@/routes/_authenticated/dashboard";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — CZMT Welfare" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const { isReviewer, isLoading } = useAuth();
  const navigate = useNavigate();
  const [caseId, setCaseId] = useState<string | undefined>();

  useEffect(() => {
    if (!isLoading && !isReviewer) navigate({ to: "/dashboard", replace: true });
  }, [isLoading, isReviewer, navigate]);

  const { data: cases = [] } = useQuery({
    queryKey: ["cases-list-report"],
    queryFn: async () => {
      const { data } = await supabase.from("welfare_events").select("id,title,target_amount,contribution_per_member,deadline,status,event_date").order("event_date", { ascending: false });
      return data ?? [];
    },
  });

  const selected = cases.find((c: any) => c.id === caseId);

  const { data: roster = [] } = useQuery({
    queryKey: ["report-roster", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("case_roster", { _case_id: caseId! });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: total } = useQuery({
    queryKey: ["report-total", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data } = await supabase.rpc("event_totals", { event_ids: [caseId!] });
      const row = (data ?? [])[0];
      return { collected: Number(row?.collected ?? 0), contributors: Number(row?.contributor_count ?? 0) };
    },
  });

  const counts = { approved: 0, pending: 0, verification_requested: 0, rejected: 0, not_paid: 0 };
  roster.forEach((r) => { (counts as any)[r.status] = ((counts as any)[r.status] ?? 0) + 1; });
  const target = Number(selected?.target_amount ?? 0);
  const collected = total?.collected ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;

  const exportCSV = () => {
    if (!selected) return;
    const rows = [
      ["Member", "Membership #", "Status", "Payment date"],
      ...roster.map((r) => [r.full_name, r.membership_number ?? "", r.status, r.payment_date ?? ""]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.title.replace(/\s+/g, "_")}_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileBarChart2 className="h-6 w-6 text-accent" /> Reports
          </h2>
          <p className="text-sm text-muted-foreground">Per-case contribution report with paid, pending, rejected, and non-contributors.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={!caseId}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!caseId}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      <Card className="print:hidden">
        <CardContent className="pt-6">
          <Select value={caseId} onValueChange={setCaseId}>
            <SelectTrigger className="max-w-md"><SelectValue placeholder="Select a welfare case" /></SelectTrigger>
            <SelectContent>
              {cases.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selected && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{selected.title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {selected.event_date}{selected.deadline ? ` · deadline ${selected.deadline}` : ""}
                {selected.contribution_per_member ? ` · KES ${formatKES(Number(selected.contribution_per_member))} per member` : ""}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-5">
                <Stat label="Expected" value={roster.length} />
                <Stat label="Paid (approved)" value={counts.approved} tone="success" />
                <Stat label="Pending" value={counts.pending + counts.verification_requested} tone="warning" />
                <Stat label="Rejected" value={counts.rejected} tone="destructive" />
                <Stat label="Not paid" value={counts.not_paid} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Target" value={target > 0 ? formatKES(target) : "—"} />
                <Stat label="Collected" value={formatKES(collected)} tone="success" />
                <Stat label="Remaining" value={target > 0 ? formatKES(Math.max(0, target - collected)) : "—"} tone="warning" />
              </div>
              {target > 0 && (
                <div>
                  <Progress value={pct} />
                  <p className="mt-1 text-xs text-muted-foreground">{pct}% of target</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Full roster</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Membership #</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roster.map((r) => (
                      <TableRow key={r.user_id}>
                        <TableCell className="font-medium">{r.full_name}</TableCell>
                        <TableCell className="text-muted-foreground">{r.membership_number ?? "—"}</TableCell>
                        <TableCell><StatusPill status={r.status} /></TableCell>
                        <TableCell>{r.payment_date ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "success" | "warning" | "destructive" }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}
