import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, XCircle, HelpCircle, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "Approvals — CZMT Welfare" }] }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { isReviewer, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!isLoading && !isReviewer) navigate({ to: "/dashboard", replace: true });
  }, [isLoading, isReviewer, navigate]);

  const { data: rows = [] } = useQuery({
    queryKey: ["approvals-queue"],
    enabled: isReviewer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contributions")
        .select("id,amount,mpesa_code,payment_date,paid_at,created_at,status,contributor_id,member_comment,event:welfare_events(id,title),contributor:profiles!contributions_contributor_id_fkey(full_name,membership_number,school)")
        .in("status", ["pending", "verification_requested"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const review = async (c: any, action: "approved" | "rejected" | "verification_requested", reason?: string) => {
    if (c.contributor_id === user?.id) return toast.error("You cannot review your own contribution");
    const patch: any = { status: action, reviewed_by: user?.id, reviewed_at: new Date().toISOString() };
    if (action === "rejected") patch.rejection_reason = reason ?? "Rejected";
    if (action === "verification_requested") patch.review_notes = reason ?? "Verification requested";
    const { error } = await supabase.from("contributions").update(patch).eq("id", c.id);
    if (error) toast.error(error.message);
    else {
      toast.success(action === "approved" ? "Approved" : action === "rejected" ? "Rejected" : "Verification requested");
      qc.invalidateQueries({ queryKey: ["approvals-queue"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats-v2"] });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CheckSquare className="h-6 w-6 text-accent" /> Treasurer Approvals
        </h2>
        <p className="text-sm text-muted-foreground">Review member submissions. Only approved contributions affect totals.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Awaiting review · {rows.length}</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing to review. 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Case</TableHead>
                    <TableHead>Contributor</TableHead>
                    <TableHead>M-Pesa code</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-64 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.payment_date ?? c.created_at?.slice(0, 10)}</TableCell>
                      <TableCell>
                        <Link to="/events/$id" params={{ id: c.event?.id }} className="text-accent hover:underline">
                          {c.event?.title ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{c.contributor?.full_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{c.contributor?.membership_number ?? ""} · {c.contributor?.school ?? ""}</p>
                        {c.member_comment && <p className="mt-1 text-xs italic text-muted-foreground">“{c.member_comment}”</p>}
                      </TableCell>
                      <TableCell className="font-mono text-xs uppercase">{c.mpesa_code ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatKES(Number(c.amount))}</TableCell>
                      <TableCell><Badge variant={c.status === "pending" ? "secondary" : "outline"}>{c.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => review(c, "approved")}>
                            <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => {
                            const note = prompt("What needs verifying?") ?? undefined;
                            if (note) review(c, "verification_requested", note);
                          }}>
                            <HelpCircle className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => {
                            const reason = prompt("Rejection reason?") ?? undefined;
                            if (reason) review(c, "rejected", reason);
                          }}>
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
