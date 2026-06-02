import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BadgeCheck, X } from "lucide-react";
import { toast } from "sonner";

export function ClaimProfileBanner() {
  const { user, profile, refresh } = useAuth();
  const qc = useQueryClient();

  const { data: match } = useQuery({
    queryKey: ["staged-match", user?.email],
    enabled: !!user?.email && !!profile,
    queryFn: async () => {
      const { data } = await supabase
        .from("staged_teachers")
        .select("*")
        .ilike("email", user!.email!)
        .is("claimed_by", null)
        .maybeSingle();
      return data;
    },
  });

  if (!match || !profile) return null;

  const confirm = async () => {
    const { error: pErr } = await supabase
      .from("profiles")
      .update({
        full_name: match.full_name,
        staff_number: match.staff_number,
        school: match.school,
        phone: match.phone,
      })
      .eq("id", profile.id);
    if (pErr) return toast.error(pErr.message);

    const { error: sErr } = await supabase
      .from("staged_teachers")
      .update({ claimed_by: profile.id, claimed_at: new Date().toISOString() })
      .eq("id", match.id);
    if (sErr) return toast.error(sErr.message);

    toast.success("Profile details confirmed and attached");
    await refresh();
    qc.invalidateQueries({ queryKey: ["staged-match"] });
  };

  const dismiss = async () => {
    // Soft-dismiss: just mark as claimed without touching the profile so it stops prompting.
    await supabase
      .from("staged_teachers")
      .update({ claimed_by: profile.id, claimed_at: new Date().toISOString() })
      .eq("id", match.id);
    qc.invalidateQueries({ queryKey: ["staged-match"] });
  };

  return (
    <Card className="border-accent/40 bg-accent/5">
      <CardContent className="flex flex-wrap items-start gap-4 pt-6">
        <div className="rounded-md bg-accent/15 p-2 text-accent">
          <BadgeCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Confirm your imported details</p>
          <p className="mt-1 text-sm text-muted-foreground">
            An admin uploaded a record matching <span className="font-medium">{match.email}</span>.
            Please review and attach it to your profile.
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div><dt className="inline text-muted-foreground">Name: </dt><dd className="inline font-medium">{match.full_name}</dd></div>
            <div><dt className="inline text-muted-foreground">Staff no.: </dt><dd className="inline font-medium">{match.staff_number ?? "—"}</dd></div>
            <div><dt className="inline text-muted-foreground">School: </dt><dd className="inline font-medium">{match.school ?? "—"}</dd></div>
            <div><dt className="inline text-muted-foreground">Phone: </dt><dd className="inline font-medium">{match.phone ?? "—"}</dd></div>
          </dl>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={confirm}>Confirm & attach</Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              <X className="mr-1 h-4 w-4" /> Not me
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
