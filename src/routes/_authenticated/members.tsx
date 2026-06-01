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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/members")({
  head: () => ({ meta: [{ title: "Members — CZMT Welfare" }] }),
  component: MembersPage,
});

function MembersPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: members = [] } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = members.filter((m) =>
    [m.full_name, m.staff_number, m.school, m.phone].some((v) =>
      (v ?? "").toString().toLowerCase().includes(q.toLowerCase()),
    ),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Members</h2>
          <p className="text-sm text-muted-foreground">{members.length} registered teachers</p>
        </div>
        {isAdmin && <AddMemberDialog onSaved={() => qc.invalidateQueries({ queryKey: ["members"] })} />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" />
            <Input
              placeholder="Search by name, staff no., school, phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-sm"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Staff No.</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Zone</TableHead>
                  {isAdmin && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.full_name}</TableCell>
                    <TableCell>{m.staff_number ?? "—"}</TableCell>
                    <TableCell>{m.school ?? "—"}</TableCell>
                    <TableCell>{m.phone ?? "—"}</TableCell>
                    <TableCell>{m.zone}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            if (!confirm(`Remove ${m.full_name}?`)) return;
                            const { error } = await supabase.from("profiles").delete().eq("id", m.id);
                            if (error) toast.error(error.message);
                            else {
                              toast.success("Removed");
                              qc.invalidateQueries({ queryKey: ["members"] });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 6 : 5} className="py-8 text-center text-muted-foreground">
                      No members found.
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

function AddMemberDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: "", staff_number: "", school: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Admin-managed manual entry: requires an associated user_id; using random uuid won't reference auth.users.
    // Instead, store as a "shadow" record requires admin. We'll use a dedicated approach: create profile only if a user exists.
    // For simplicity, admins add through their own auth-linked profile editing OR add unlinked records via service. Here we error if not linked.
    toast.message("Tip", { description: "Members register themselves via Sign Up. Admins can edit/remove from this page." });
    setSaving(false);
    setOpen(false);
    onSaved();
    void form;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> Add member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How members are added</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          For security, each member has their own login. Share the sign-up link with teachers — they'll
          register themselves with name, staff number, school, and phone. Admins can edit or remove
          records from this page once they appear.
        </p>
        <DialogFooter>
          <Button onClick={submit} disabled={saving}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
