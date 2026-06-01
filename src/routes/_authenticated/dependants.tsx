import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dependants")({
  head: () => ({ meta: [{ title: "Dependants — CZMT Welfare" }] }),
  component: DependantsPage,
});

function DependantsPage() {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();

  const { data: members = [] } = useQuery({
    queryKey: ["members-min"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").order("full_name");
      return data ?? [];
    },
  });

  const { data: deps = [] } = useQuery({
    queryKey: ["dependants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dependants")
        .select("*, member:profiles!dependants_member_id_fkey(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const canManage = (memberId: string) => isAdmin || memberId === profile?.id;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dependants</h2>
          <p className="text-sm text-muted-foreground">Family members linked to each teacher</p>
        </div>
        <AddDependantDialog
          members={members}
          defaultMemberId={profile?.id}
          isAdmin={isAdmin}
          onSaved={() => qc.invalidateQueries({ queryKey: ["dependants"] })}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Date of birth</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deps.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell>{d.relationship}</TableCell>
                    <TableCell>{d.date_of_birth ?? "—"}</TableCell>
                    <TableCell>{d.member?.full_name ?? "—"}</TableCell>
                    <TableCell>
                      {canManage(d.member_id) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            if (!confirm(`Remove ${d.name}?`)) return;
                            const { error } = await supabase.from("dependants").delete().eq("id", d.id);
                            if (error) toast.error(error.message);
                            else {
                              toast.success("Removed");
                              qc.invalidateQueries({ queryKey: ["dependants"] });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {deps.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No dependants registered yet.
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

function AddDependantDialog({
  members, defaultMemberId, isAdmin, onSaved,
}: {
  members: { id: string; full_name: string }[];
  defaultMemberId?: string;
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState<string | undefined>(defaultMemberId);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [dob, setDob] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId) return toast.error("Choose a member");
    setSaving(true);
    const { error } = await supabase.from("dependants").insert({
      member_id: memberId,
      name,
      relationship,
      date_of_birth: dob || null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Dependant added");
      setOpen(false);
      setName(""); setRelationship(""); setDob("");
      onSaved();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> Add dependant</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add dependant</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Member</Label>
            <Select value={memberId} onValueChange={setMemberId} disabled={!isAdmin && !!defaultMemberId}>
              <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Relationship</Label>
            <Input required placeholder="Spouse, Child, Parent…" value={relationship} onChange={(e) => setRelationship(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Date of birth (optional)</Label>
            <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
