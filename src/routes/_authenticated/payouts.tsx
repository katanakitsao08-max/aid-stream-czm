import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/payouts")({
  head: () => ({ meta: [{ title: "Payouts — CZMT Welfare" }] }),
  component: PayoutsPage,
});

function PayoutsPage() {
  const { isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!isLoading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [isLoading, isAdmin, navigate]);

  const { data: payouts = [] } = useQuery({
    queryKey: ["payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("welfare_payouts")
        .select("*, case:welfare_events(id,title)")
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = payouts.reduce((s: number, p: any) => s + Number(p.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Wallet className="h-6 w-6 text-accent" /> Welfare Payouts
          </h2>
          <p className="text-sm text-muted-foreground">Track money disbursed to beneficiaries.</p>
        </div>
        {isAdmin && <NewPayoutDialog onSaved={() => qc.invalidateQueries({ queryKey: ["payouts"] })} />}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Total disbursed: {formatKES(total)}</CardTitle></CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No payouts recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Case</TableHead>
                    <TableHead>Paid to</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {isAdmin && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.paid_at}</TableCell>
                      <TableCell className="font-medium">{p.case?.title ?? "—"}</TableCell>
                      <TableCell>{p.paid_to}</TableCell>
                      <TableCell>{p.method ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{p.reference ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatKES(Number(p.amount))}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={async () => {
                            if (!confirm("Delete this payout?")) return;
                            const { error } = await supabase.from("welfare_payouts").delete().eq("id", p.id);
                            if (error) toast.error(error.message);
                            else { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["payouts"] }); }
                          }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
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

function NewPayoutDialog({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [caseId, setCaseId] = useState<string | undefined>();
  const [amount, setAmount] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: cases = [] } = useQuery({
    queryKey: ["cases-min"],
    queryFn: async () => {
      const { data } = await supabase.from("welfare_events").select("id,title").order("event_date", { ascending: false });
      return data ?? [];
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId) return toast.error("Pick a case");
    setSaving(true);
    const { error } = await supabase.from("welfare_payouts").insert({
      case_id: caseId,
      amount: Number(amount),
      paid_to: paidTo,
      paid_at: paidAt,
      method: method || null,
      reference: reference || null,
      notes: notes || null,
      recorded_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Payout recorded");
    setOpen(false);
    setAmount(""); setPaidTo(""); setMethod(""); setReference(""); setNotes(""); setCaseId(undefined);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> Record payout</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record a payout</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2">
            <Label>Welfare case</Label>
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger><SelectValue placeholder="Select case" /></SelectTrigger>
              <SelectContent>
                {cases.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Amount (KES)</Label><Input type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-2"><Label>Date paid</Label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Paid to</Label><Input required value={paidTo} onChange={(e) => setPaidTo(e.target.value)} placeholder="Beneficiary name" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Method</Label><Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="M-Pesa / Bank" /></div>
            <div className="space-y-2"><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Record payout"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
