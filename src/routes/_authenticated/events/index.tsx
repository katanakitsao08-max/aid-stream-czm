import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, ChevronRight, HeartHandshake, Search } from "lucide-react";
import { toast } from "sonner";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/events/")({
  head: () => ({ meta: [{ title: "Welfare Cases — CZMT" }] }),
  component: EventsPage,
});

const CASE_TYPES = ["bereavement", "hospital", "emergency", "school", "retirement", "disaster", "other"] as const;
type CaseType = typeof CASE_TYPES[number];

const STATUSES = ["draft", "active", "closed", "completed"] as const;
type CaseStatus = typeof STATUSES[number];

function EventsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "all">("all");

  const { data: events = [] } = useQuery({
    queryKey: ["cases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("welfare_events")
        .select("*, affected:profiles!welfare_events_affected_member_id_fkey(full_name)")
        .order("event_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: totals = {} } = useQuery({
    queryKey: ["event-totals"],
    queryFn: async () => {
      const { data } = await supabase.rpc("event_totals");
      const t: Record<string, { collected: number; contributors: number }> = {};
      (data ?? []).forEach((c: any) => {
        t[c.event_id] = { collected: Number(c.collected ?? 0), contributors: Number(c.contributor_count ?? 0) };
      });
      return t;
    },
  });

  const filtered = useMemo(() => {
    return (events ?? []).filter((e: any) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (q && !`${e.title} ${e.beneficiary_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [events, statusFilter, q]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Welfare Cases</h2>
          <p className="text-sm text-muted-foreground">Event-based welfare cases and contribution drives</p>
        </div>
        {isAdmin && (
          <NewEventDialog onSaved={() => qc.invalidateQueries({ queryKey: ["cases"] })} />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title or beneficiary" className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <HeartHandshake className="h-10 w-10 text-accent" />
            <p className="font-medium">No welfare cases match</p>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "Create a welfare case when a need arises." : "When cases are created, they will appear here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((e: any) => {
            const t = totals[e.id];
            const collected = t?.collected ?? 0;
            const contributors = t?.contributors ?? 0;
            const target = Number(e.target_amount ?? 0);
            const pct = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;
            const funded = target > 0 && collected >= target;
            return (
              <Link key={e.id} to="/events/$id" params={{ id: e.id }}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="space-y-3 pt-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{e.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {e.event_date} · {e.event_type}
                          {e.beneficiary_name ? ` · ${e.beneficiary_name}` : e.affected?.full_name ? ` · ${e.affected.full_name}` : ""}
                        </p>
                      </div>
                      <Badge variant={funded ? "default" : e.status === "active" ? "secondary" : "outline"}>
                        {funded ? "Funded" : e.status}
                      </Badge>
                    </div>
                    {e.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{e.description}</p>
                    )}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{formatKES(collected)}</span>
                        {target > 0 && <span className="text-muted-foreground">of {formatKES(target)}</span>}
                      </div>
                      {target > 0 && <Progress value={pct} />}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{contributors} paid</span>
                        {e.contribution_per_member && <span>KES {formatKES(Number(e.contribution_per_member))} per member</span>}
                        {e.deadline && <span>Deadline {e.deadline}</span>}
                      </div>
                    </div>
                    <div className="flex items-center justify-end text-sm text-accent">
                      View details <ChevronRight className="h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewEventDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [type, setType] = useState<CaseType>("bereavement");
  const [status, setStatus] = useState<CaseStatus>("active");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [deadline, setDeadline] = useState("");
  const [target, setTarget] = useState("");
  const [perMember, setPerMember] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("welfare_events").insert({
      title,
      description: desc || null,
      event_type: type,
      status,
      event_date: date,
      deadline: deadline || null,
      target_amount: target ? Number(target) : null,
      contribution_per_member: perMember ? Number(perMember) : null,
      beneficiary_name: beneficiary || null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Welfare case created");
    setOpen(false);
    setTitle(""); setDesc(""); setTarget(""); setPerMember(""); setDeadline(""); setBeneficiary("");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> New case</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create welfare case</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hospital Support for Jane" />
          </div>
          <div className="space-y-2">
            <Label>Beneficiary</Label>
            <Input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="Full name of beneficiary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CASE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Opened on</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Deadline</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount per member (KES)</Label>
              <Input type="number" min={0} value={perMember} onChange={(e) => setPerMember(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Target amount (KES)</Label>
              <Input type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create case"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
