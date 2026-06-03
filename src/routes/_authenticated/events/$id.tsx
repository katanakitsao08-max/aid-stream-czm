import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Download, Lock, Unlock, Smartphone, CheckCircle2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/events/$id")({
  component: EventDetail,
});

function EventDetail() {
  const { id } = Route.useParams();
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();

  const { data: event } = useQuery({
    queryKey: ["event", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("welfare_events")
        .select("*, affected:profiles!welfare_events_affected_member_id_fkey(full_name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: contributions = [] } = useQuery({
    queryKey: ["contributions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contributions")
        .select("*, contributor:profiles!contributions_contributor_id_fkey(full_name, staff_number, school)")
        .eq("event_id", id)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members-min"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").order("full_name");
      return data ?? [];
    },
  });

  if (!event) {
    return <p className="text-muted-foreground">Loading event…</p>;
  }

  const confirmedContribs = contributions.filter((c: any) => c.status !== "pending");
  const pendingContribs = contributions.filter((c: any) => c.status === "pending");
  const collected = confirmedContribs.reduce((s: number, c: any) => s + Number(c.amount), 0);
  const target = Number(event.target_amount ?? 0);
  const pct = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;
  const funded = target > 0 && collected >= target;

  const toggleStatus = async () => {
    const next = event.status === "open" ? "closed" : "open";
    const { error } = await supabase.from("welfare_events").update({ status: next }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Event ${next}`);
      qc.invalidateQueries({ queryKey: ["event", id] });
      qc.invalidateQueries({ queryKey: ["events"] });
    }
  };

  const exportCSV = () => {
    const rows = [
      ["Date", "Contributor", "Staff No", "School", "Amount (KES)", "Notes"],
      ...contributions.map((c: any) => [
        c.paid_at,
        c.contributor?.full_name ?? "",
        c.contributor?.staff_number ?? "",
        c.contributor?.school ?? "",
        c.amount,
        (c.notes ?? "").replace(/\n/g, " "),
      ]),
      [],
      ["Total", "", "", "", collected, ""],
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title.replace(/\s+/g, "_")}_contributions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Link to="/events" className="inline-flex items-center text-sm text-accent">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to events
      </Link>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight">{event.title}</h2>
                <Badge variant={funded ? "default" : event.status === "open" ? "secondary" : "outline"}>
                  {funded ? "Funded" : event.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {event.event_date} · {event.event_type}
                {event.affected?.full_name ? ` · for ${event.affected.full_name}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={toggleStatus}>
                  {event.status === "open" ? <Lock className="mr-2 h-4 w-4" /> : <Unlock className="mr-2 h-4 w-4" />}
                  {event.status === "open" ? "Close" : "Reopen"}
                </Button>
              )}
            </div>
          </div>

          {event.description && (
            <p className="text-sm text-foreground/80">{event.description}</p>
          )}

          <div className="rounded-md border border-border bg-muted/40 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-2xl font-bold">{formatKES(collected)}</p>
              {target > 0 && <p className="text-sm text-muted-foreground">target {formatKES(target)} ({pct}%)</p>}
            </div>
            {target > 0 && <Progress value={pct} />}
            <p className="mt-2 text-xs text-muted-foreground">
              {contributions.length} contribution{contributions.length === 1 ? "" : "s"} recorded
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Contributions</CardTitle>
          <div className="flex gap-2">
            {profile && event.status === "open" && (
              <MpesaPayDialog
                eventId={id}
                eventTitle={event.title}
                contributorId={profile.id}
                onSaved={() => qc.invalidateQueries({ queryKey: ["contributions", id] })}
              />
            )}
            {isAdmin && (
              <AddContributionDialog
                eventId={id}
                members={members}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["contributions", id] });
                  qc.invalidateQueries({ queryKey: ["event-totals"] });
                }}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {pendingContribs.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">
                Pending M-Pesa submissions ({pendingContribs.length})
              </p>
              <div className="overflow-x-auto rounded-md border border-warning/40 bg-warning/5">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Contributor</TableHead>
                      <TableHead>M-Pesa code</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-32"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingContribs.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.paid_at}</TableCell>
                        <TableCell className="font-medium">{c.contributor?.full_name ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs uppercase">{c.mpesa_code ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatKES(Number(c.amount))}</TableCell>
                        <TableCell className="text-right">
                          {isAdmin ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={async () => {
                                  const { error } = await supabase
                                    .from("contributions")
                                    .update({ status: "confirmed" })
                                    .eq("id", c.id);
                                  if (error) toast.error(error.message);
                                  else {
                                    toast.success("Confirmed");
                                    qc.invalidateQueries({ queryKey: ["contributions", id] });
                                  }
                                }}
                              >
                                <CheckCircle2 className="mr-1 h-4 w-4" /> Confirm
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={async () => {
                                  if (!confirm("Reject this submission?")) return;
                                  const { error } = await supabase.from("contributions").delete().eq("id", c.id);
                                  if (error) toast.error(error.message);
                                  else qc.invalidateQueries({ queryKey: ["contributions", id] });
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <Badge variant="secondary">Awaiting admin</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Contributor</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-12 text-right">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {confirmedContribs.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.paid_at}</TableCell>
                    <TableCell className="font-medium">{c.contributor?.full_name ?? "—"}</TableCell>
                    <TableCell>{c.contributor?.school ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatKES(Number(c.amount))}</TableCell>
                    <TableCell className="max-w-xs truncate">{c.notes ?? ""}</TableCell>
                    {isAdmin ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="icon" title="View receipt">
                            <Link to="/receipts/$contributionId" params={{ contributionId: c.id }} target="_blank">
                              <Receipt className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              if (!confirm("Delete this contribution?")) return;
                              const { error } = await supabase.from("contributions").delete().eq("id", c.id);
                              if (error) toast.error(error.message);
                              else {
                                toast.success("Deleted");
                                qc.invalidateQueries({ queryKey: ["contributions", id] });
                                qc.invalidateQueries({ queryKey: ["event-totals"] });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : (
                      <TableCell>
                        <Button asChild variant="ghost" size="sm" title="View receipt">
                          <Link to="/receipts/$contributionId" params={{ contributionId: c.id }} target="_blank">
                            <Receipt className="mr-1 h-4 w-4" /> Receipt
                          </Link>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {confirmedContribs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No confirmed contributions yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const MPESA_PHONE = "0701594268";

function MpesaPayDialog({
  eventId, eventTitle, contributorId, onSaved,
}: {
  eventId: string;
  eventTitle: string;
  contributorId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    const trimmed = code.trim().toUpperCase();
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (trimmed.length < 6) return toast.error("Enter the M-Pesa confirmation code");
    setSaving(true);
    const { error } = await supabase.from("contributions").insert({
      event_id: eventId,
      contributor_id: contributorId,
      amount: amt,
      mpesa_code: trimmed,
      status: "pending",
      notes: `M-Pesa to ${MPESA_PHONE}`,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Submitted — awaiting admin confirmation");
    setOpen(false);
    setAmount(""); setCode("");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">
          <Smartphone className="mr-2 h-4 w-4" /> Pay via M-Pesa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Pay via M-Pesa</DialogTitle></DialogHeader>
        <div className="rounded-md border border-accent/40 bg-accent/5 p-4 text-sm">
          <p className="font-medium">Send your contribution using M-Pesa:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-foreground/90">
            <li>Open M-Pesa → <span className="font-medium">Send Money</span></li>
            <li>Phone number: <span className="font-mono text-base font-semibold">{MPESA_PHONE}</span></li>
            <li>Enter the amount you want to contribute</li>
            <li>Reference: <span className="font-medium">{eventTitle}</span></li>
            <li>Enter your M-Pesa PIN and confirm</li>
            <li>Paste the confirmation code (e.g. <span className="font-mono">SLM7XX9ABC</span>) below</li>
          </ol>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount (KES)</Label>
              <Input type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>M-Pesa code</Label>
              <Input
                required
                placeholder="e.g. SLM7XX9ABC"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Submitting…" : "Submit for confirmation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddContributionDialog({
  eventId, members, onSaved,
}: {
  eventId: string;
  members: { id: string; full_name: string }[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [contributorId, setContributorId] = useState<string | undefined>();
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contributorId) return toast.error("Pick a contributor");
    setSaving(true);
    const { error } = await supabase.from("contributions").insert({
      event_id: eventId,
      contributor_id: contributorId,
      amount: Number(amount),
      paid_at: paidAt,
      notes: notes || null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Contribution recorded");
      setOpen(false);
      setAmount(""); setNotes(""); setContributorId(undefined);
      onSaved();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Record contribution</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record contribution</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Contributor</Label>
            <Select value={contributorId} onValueChange={setContributorId}>
              <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount (KES)</Label>
              <Input type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Date paid</Label>
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
