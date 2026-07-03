import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/roles")({
  head: () => ({ meta: [{ title: "Role Management — CZMT Welfare" }] }),
  component: RolesPage,
});

const ROLE_OPTIONS: AppRole[] = ["member", "treasurer", "committee", "admin"];

const roleLabel: Record<AppRole, string> = {
  admin: "Admin",
  treasurer: "Treasurer",
  committee: "Welfare Committee",
  member: "Member",
};

const roleVariant: Record<AppRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  treasurer: "default",
  committee: "secondary",
  member: "outline",
};

function RolesPage() {
  const { isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!isLoading && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [isAdmin, isLoading, navigate]);

  const { data: members = [] } = useQuery({
    queryKey: ["members-with-roles"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("id, user_id, full_name, staff_number, school").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const roleMap = new Map<string, AppRole[]>();
      for (const r of roles ?? []) {
        const list = roleMap.get(r.user_id) ?? [];
        list.push(r.role as AppRole);
        roleMap.set(r.user_id, list);
      }
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: roleMap.get(p.user_id) ?? (["member"] as AppRole[]),
      }));
    },
  });

  const filtered = members.filter((m) =>
    [m.full_name, m.staff_number, m.school].some((v) =>
      (v ?? "").toString().toLowerCase().includes(q.toLowerCase()),
    ),
  );

  const setRole = async (userId: string, current: AppRole[], next: AppRole) => {
    // Single-role model: replace whatever roles they have with the chosen one.
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delErr) return toast.error(delErr.message);
    const { error: insErr } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role: next });
    if (insErr) return toast.error(insErr.message);
    toast.success(`Role updated to ${roleLabel[next]}`);
    void current;
    qc.invalidateQueries({ queryKey: ["members-with-roles"] });
  };

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ShieldCheck className="h-6 w-6 text-primary" /> Role Management
        </h2>
        <p className="text-sm text-muted-foreground">
          Promote members to the Welfare Committee or grant Admin access.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" />
            <Input
              placeholder="Search by name, staff no., school…"
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
                  <TableHead>Current role</TableHead>
                  <TableHead className="w-56">Change role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => {
                  const primary: AppRole = m.roles.includes("admin")
                    ? "admin"
                    : m.roles.includes("committee")
                      ? "committee"
                      : "member";
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.full_name}</TableCell>
                      <TableCell>{m.staff_number ?? "—"}</TableCell>
                      <TableCell>{m.school ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={roleVariant[primary]}>{roleLabel[primary]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={primary}
                          onValueChange={(v) => setRole(m.user_id, m.roles, v as AppRole)}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {roleLabel[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
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
