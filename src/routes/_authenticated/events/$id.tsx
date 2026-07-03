import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Download, Lock, Unlock, Smartphone, CheckCircle2, XCircle, Receipt, HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatKES } from "@/lib/format";
import { StatusPill } from "@/routes/_authenticated/dashboard";

export const Route = createFileRoute("/_authenticated/events/$id")({
  component: EventDetail,
});

const MPESA_PHONE = "0701594268";

function EventDetail() {
  const { id } = Route.useParams();
  const { isAdmin, isReviewer, profile } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "approved" | "pending" | "rejected" | "not_paid">("all");

  const { data: event } = useQuery({
    queryKey: ["case", id],
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

  const { data: roster = [] } = useQuery({
    queryKey: ["case-roster", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("case_roster", { _case_id: id });
      if (error) throw error;
      return data as { user_id: string; full_name: string; membership_number: string | null; status: string; payment_date: string | null }[];
    },
  });

  const { data: myContribs = [] } = useQuery({
    queryKey: ["contribs-scoped", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("contributions")
        .select("*, contributor:profiles!contributions_contributor_id_fkey(full_name, membership_number, school)")
        .eq("event_id", id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: liveTotal } = useQuery({
    queryKey: ["case-total", id],
    queryFn: async () => {
      const { data } = await supabase.rpc("event_totals", { event_ids: [id] });
      const row = (data ?? [])[0];
      return {
        collected: Number(row?.collected ?? 0),
        contributors: Number(row?.contributor_count ?? 0),
      };
    },
  });

  const counts = useMemo(() => {
    const c = { approved: 0, pending: 0, verification_requested: 0, rejected: 0, not_paid: 0, total: roster.length };
    roster.forEach((r) => { (c as any)[r.status] = ((c as any)[r.status] ?? 0) + 1; });
    return c;
  }, [roster]);

  const filteredRoster = useMemo(() => {
    if (tab === "all") return roster;
    if (tab === "pending") return roster.filter((r) => r.status === "pending" || r.status === "verification_requested");
    return roster.filter((r) => r.status === tab);
  }, [roster, tab]);

  if (!event) return <p className="text-muted-foreground">Loading case…</p>;

  const target = Number(event.target_amount ?? 0);
  const collected = liveTotal?.collected ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;
  const funded = target > 0 && collected >= target;
  const remaining = Math.max(0, target - collected);

  const pendingSubs = myContribs.filter((c: any) => c.status === "pending" || c.status === "verification_requested");

  const toggleStatus = async () => {
    const next = event.status === "active" || event.status === "open" ? "closed" : "active";
    const { error } = await supabase.from("welfare_events").update({ status: next } as any).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Case ${next}`);
      qc.invalidateQueries({ queryKey: ["case", id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
    }
  };

  const exportCSV = () => {
    const rows = [
      ["Member", "Membership #", "Status", "Payment date"],
      ...roster.map((r) => [r.full_name, r.membership_number ?? "", r.status, r.payment_date ?? ""]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title.replace(/\s+/g, "_")}_roster.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Link to="/events" className="inline-flex items-center text-sm text-accent">
        <ArrowLeft className="mr-1 h-4 w-4" /> Back to cases
      </Link>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold tracking-tight">{event.title}</h2>
                <Badge variant={funded ? "default" : event.status === "active" ? "secondary" : "outline"}>
                  {funded ? "Funded" : event.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {event.event_date} · {event.event_type}
                {event.beneficiary_name ? ` · for ${event.beneficiary_name}` : event.affected?.full_name ? ` · for ${event.affected.full_name}` : ""}
                {event.deadline ? ` · deadline ${event.deadline}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="mr-2 h-4 w-4" /> Export roster
              </Button>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={toggleStatus}>
                  {event.status === "active" || event.status === "open" ? <Lock className="mr-2 h-4 w-4" /> : <Unlock className="mr-2 h-4 w-4" />}
                  {event.status === "active" || event.status === "open" ? "Close case" : "Reopen"}
                </Button>
              )}
            </div>
          </div>

          {event.description && <p className="text-sm text-foreground/80">{event.description}</p>}

          <div className="grid gap-3 sm:grid-cols-4">
            <MiniStat label="Target" value={target > 0 ? formatKES(target) : "—"} />
            <MiniStat label="Collected" value={formatKES(collected)} accent="success" />
            <MiniStat label="Remaining" value={target > 0 ? formatKES(remaining) : "—"} accent="warning" />
            <MiniStat label="Per member" value={event.contribution_per_member ? `KES ${formatKES(Number(event.contribution_per_member))}` : "—"} />
          </div>

          {target > 0 && (
            <div>
              <Progress value={pct} />
              <p className="mt-1 text-xs text-muted-foreground">{pct}% of target</p>
            </div>
          )}
        </CardContent>
      </Card>

      {profile && (event.status === "active" || event.status === "open") && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Submit your contribution</CardTitle>
            {pendingSubs.length > 0 && <Badge variant="secondary">{pendingSubs.length} pending review</Badge>}
          </CardHeader>
          <CardContent>
            <SubmitContributionDialog
              eventId={id}
              eventTitle={event.title}
              suggestedAmount={event.contribution_per_member ? Number(event.contribution_per_member) : undefined}
              contributorId={profile.id}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: ["contribs-scoped", id] });
                qc.invalidateQueries({ queryKey: ["case-roster", id] });
              }}
            />
            {myContribs.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Your submissions</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>M-Pesa code</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Receipt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myContribs.filter((c: any) => c.contributor_id === profile.id).map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell>{c.payment_date ?? c.paid_at}</TableCell>
                          <TableCell className="font-mono text-xs uppercase">{c.mpesa_code ?? "—"}</TableCell>
                          <TableCell className="text-right">{formatKES(Number(c.amount))}</TableCell>
                          <TableCell><StatusPill status={c.status} /></TableCell>
                          <TableCell className="text-right">
                            {c.status === "approved" || c.status === "confirmed" ? (
                              <Button asChild variant="ghost" size="sm">
                                <Link to="/receipts/$contributionId" params={{ contributionId: c.id }} target="_blank">
                                  <Receipt className="mr-1 h-4 w-4" /> Receipt
                                </Link>
                              </Button>
                            ) : c.status === "rejected" ? (
                              <span className="text-xs text-muted-foreground" title={c.rejection_reason ?? ""}>{c.rejection_reason ?? "Rejected"}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Awaiting</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isReviewer && (
        <ReviewerQueue caseId={id} contribs={myContribs} onChange={() => {
          qc.invalidateQueries({ queryKey: ["contribs-scoped", id] });
          qc.invalidateQueries({ queryKey: ["case-roster", id] });
          qc.invalidateQueries({ queryKey: ["case-total", id] });
        }} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Member contribution status</CardTitle>
          <div className="mt-3 flex flex-wrap gap-2">
            <TabButton active={tab === "all"} onClick={() => setTab("all")}>All ({counts.total})</TabButton>
            <TabButton active={tab === "approved"} onClick={() => setTab("approved")} tone="success">Paid ({counts.approved})</TabButton>
            <TabButton active={tab === "pending"} onClick={() => setTab("pending")} tone="warning">Pending ({counts.pending + counts.verification_requested})</TabButton>
            <TabButton active={tab === "rejected"} onClick={() => setTab("rejected")} tone="destructive">Rejected ({counts.rejected})</TabButton>
            <TabButton active={tab === "not_paid"} onClick={() => setTab("not_paid")}>Not paid ({counts.not_paid})</TabButton>
          </div>
        </CardHeader>
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
                {filteredRoster.map((r) => (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.membership_number ?? "—"}</TableCell>
                    <TableCell><StatusPill status={r.status} /></TableCell>
                    <TableCell>{r.payment_date ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {filteredRoster.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No members in this filter.</TableCell>
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

function MiniStat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: "success" | "warning" }) {
  const color = accent === "success" ? "text-success" : accent === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "success" | "warning" | "destructive" }) {
  const activeClass =
    tone === "success" ? "bg-success/15 text-success border-success/40"
    : tone === "warning" ? "bg-warning/15 text-warning border-warning/40"
    : tone === "destructive" ? "bg-destructive/15 text-destructive border-destructive/40"
    : "bg-accent/15 text-accent border-accent/40";
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${active ? activeClass : "border-border text-muted-foreground hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}

function ReviewerQueue({ caseId, contribs, onChange }: { caseId: string; contribs: any[]; onChange: () => void }) {
  const { user } = useAuth();
  const pending = contribs.filter((c: any) => c.status === "pending" || c.status === "verification_requested");
  if (pending.length === 0) return null;

  const review = async (c: any, action: "approved" | "rejected" | "verification_requested", reason?: string) => {
    if (c.contributor_id === user?.id) return toast.error("You cannot review your own contribution");
    const patch: any = { status: action, reviewed_by: user?.id, reviewed_at: new Date().toISOString() };
    if (action === "rejected") patch.rejection_reason = reason ?? "Rejected";
    if (action === "verification_requested") patch.review_notes = reason ?? "Verification requested";
    const { error } = await supabase.from("contributions").update(patch).eq("id", c.id);
    if (error) toast.error(error.message);
    else {
      toast.success(action === "approved" ? "Approved" : action === "rejected" ? "Rejected" : "Verification requested");
      onChange();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-warning">Treasurer review queue · {pending.length}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Contributor</TableHead>
                <TableHead>M-Pesa code</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-64 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell>{c.payment_date ?? c.paid_at}</TableCell>
                  <TableCell>
                    <p className="font-medium">{c.contributor?.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{c.contributor?.membership_number ?? ""}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs uppercase">{c.mpesa_code ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatKES(Number(c.amount))}</TableCell>
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
      </CardContent>
    </Card>
  );
}

function SubmitContributionDialog({
  eventId, eventTitle, contributorId, suggestedAmount, onSaved,
}: {
  eventId: string;
  eventTitle: string;
  contributorId: string;
  suggestedAmount?: number;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(suggestedAmount ? String(suggestedAmount) : "");
  const [code, setCode] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState("");
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
      payment_date: paidAt,
      member_comment: comment || null,
      notes: `M-Pesa to ${MPESA_PHONE}`,
    } as any);
    setSaving(false);
    if (error) {
      if (error.code === "23505") return toast.error("You already have a submission awaiting review for this case.");
      return toast.error(error.message);
    }
    toast.success("Submitted — awaiting treasurer approval");
    setOpen(false);
    setCode(""); setComment("");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Smartphone className="mr-2 h-4 w-4" /> Submit contribution</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Pay for “{eventTitle}”</DialogTitle></DialogHeader>
        <div className="rounded-md border border-accent/40 bg-accent/5 p-4 text-sm">
          <p className="font-medium">Send your contribution using M-Pesa:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-foreground/90">
            <li>Open M-Pesa → <span className="font-medium">Send Money</span></li>
            <li>Phone number: <span className="font-mono text-base font-semibold">{MPESA_PHONE}</span></li>
            <li>Enter the amount you want to contribute{suggestedAmount ? ` (suggested KES ${formatKES(suggestedAmount)})` : ""}</li>
            <li>Reference: <span className="font-medium">{eventTitle}</span></li>
            <li>Paste the confirmation code below</li>
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
              <Input required placeholder="e.g. SLM7XX9ABC" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono uppercase" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Payment date</Label>
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Comment (optional)</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything the treasurer should know" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? "Submitting…" : "Submit for approval"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
