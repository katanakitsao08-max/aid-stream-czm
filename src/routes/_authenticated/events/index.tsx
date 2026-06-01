import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Plus, ChevronRight, HeartHandshake } from "lucide-react";
import { toast } from "sonner";
import { formatKES } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/events/")({
  head: () => ({ meta: [{ title: "Welfare Events — CZMT" }] }),
  component: EventsPage,
});

function EventsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
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
      const { data } = await supabase.from("contributions").select("event_id, amount");
      const t: Record<string, number> = {};
      (data ?? []).forEach((c) => {
        t[c.event_id] = (t[c.event_id] ?? 0) + Number(c.amount);
      });
      return t;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Welfare Events</h2>
          <p className="text-sm text-muted-foreground">Event-based welfare cases and contribution drives</p>
        </div>
        {isAdmin && (
          <NewEventDialog
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["events"] });
            }}
          />
        )}
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <HeartHandshake className="h-10 w-10 text-accent" />
            <p className="font-medium">No welfare events yet</p>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "Create the first event when a need arises." : "When events are created, they will appear here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {events.map((e: any) => {
            const collected = totals[e.id] ?? 0;
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
                          {e.affected?.full_name ? ` · ${e.affected.full_name}` : ""}
                        </p>
                      </div>
                      <Badge variant={funded ? "default" : e.status === "open" ? "secondary" : "outline"}>
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
                    </div>
                    <div className="flex items-center justify-end text-sm text-accent">
                      View contributions <ChevronRight className="h-4 w-4" />
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
  const [type, setType] = useState<"bereavement" | "emergency" | "other">("bereavement");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [target, setTarget] = useState("");
  const [affectedId, setAffectedId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["members-min"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").order("full_name");
      return data ?? [];
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("welfare_events").insert({
      title,
      description: desc || null,
      event_type: type,
      event_date: date,
      target_amount: target ? Number(target) : null,
      affected_member_id: affectedId ?? null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Event created");
      setOpen(false);
      setTitle(""); setDesc(""); setTarget(""); setAffectedId(undefined);
      onSaved();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> New event</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create welfare event</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bereavement: Mwalimu Juma" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bereavement">Bereavement</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Affected member (optional)</Label>
            <Select value={affectedId} onValueChange={setAffectedId}>
              <SelectTrigger><SelectValue placeholder="Choose member" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Target amount KES (optional)</Label>
            <Input type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
