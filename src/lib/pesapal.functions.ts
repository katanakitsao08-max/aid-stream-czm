import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InitiateInput = z.object({
  caseId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
  phone: z.string().trim().optional().nullable(),
});

export const initiatePesapalPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InitiateInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ ensureIPN, submitOrder, pesapalEnvName, getPesapalToken }, { supabaseAdmin }] = await Promise.all([
      import("./pesapal.server"),
      import("@/integrations/supabase/client.server"),
    ]);

    const host = getRequestHost();
    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const baseUrl = `${proto}://${host}`;

    // Kick off all independent work in parallel: DB reads, IPN registration,
    // Pesapal auth token warm-up, and auth user lookup.
    const [caseRes, profileRes, dupRes, authUserRes, notificationId] = await Promise.all([
      supabase.from("welfare_events").select("id, title, status").eq("id", data.caseId).maybeSingle(),
      supabase.from("profiles").select("id, full_name, phone").eq("user_id", userId).maybeSingle(),
      supabase
        .from("contributions")
        .select("id")
        .eq("event_id", data.caseId)
        .eq("contributor_id", userId) // best-effort early check; re-checked below with profile id
        .in("status", ["pending", "approved", "confirmed", "verification_requested"])
        .maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(userId),
      ensureIPN(baseUrl),
      getPesapalToken(), // pre-warm auth token cache
    ]);

    if (caseRes.error) throw new Error(caseRes.error.message);
    const kase = caseRes.data;
    if (!kase) throw new Error("Case not found");
    if (kase.status && !["active", "open", "draft"].includes(String(kase.status))) {
      throw new Error("This case is closed and no longer accepting contributions.");
    }

    const profile = profileRes.data;
    if (!profile) throw new Error("Complete your profile before contributing.");
    const contributorProfileId = profile.id;

    // Definitive dup check with correct profile id
    const { data: dup } = dupRes.data
      ? { data: dupRes.data }
      : await supabase
          .from("contributions")
          .select("id")
          .eq("event_id", data.caseId)
          .eq("contributor_id", contributorProfileId)
          .in("status", ["pending", "approved", "confirmed", "verification_requested"])
          .maybeSingle();
    if (dup) throw new Error("You already have a submission for this case.");

    const merchantReference = `wf-${data.caseId.slice(0, 8)}-${userId.slice(0, 8)}-${Date.now().toString(36)}`;

    const submit = await submitOrder({
      merchantReference,
      amount: data.amount,
      description: `Welfare: ${kase.title ?? "contribution"}`.slice(0, 100),
      callbackUrl: `${baseUrl}/api/public/pesapal-callback`,
      notificationId,
      email: authUserRes.data?.user?.email ?? null,
      phone: data.phone ?? profile.phone ?? null,
      firstName: (profile.full_name ?? "").split(" ")[0] || null,
      lastName: (profile.full_name ?? "").split(" ").slice(1).join(" ") || null,
    });

    // Fire-and-forget the transaction insert + audit log in parallel with the return.
    // The IPN/callback re-fetches by order_tracking_id, so the redirect need not wait on these writes.
    void supabaseAdmin
      .from("pesapal_transactions")
      .insert({
        merchant_reference: merchantReference,
        order_tracking_id: submit.order_tracking_id,
        environment: pesapalEnvName(),
        case_id: data.caseId,
        contributor_id: contributorProfileId,
        amount: data.amount,
        currency: "KES",
        status: "PENDING",
        redirect_url: submit.redirect_url,
        raw_submit: JSON.parse(JSON.stringify(submit)),
      })
      .then(({ error }) => {
        if (error) console.error("[pesapal] tx insert failed", error.message);
      });

    void supabaseAdmin
      .from("audit_logs")
      .insert({
        actor_id: userId,
        action: "pesapal.initiate",
        entity_type: "pesapal_transaction",
        entity_id: merchantReference,
        metadata: { case_id: data.caseId, amount: data.amount, order_tracking_id: submit.order_tracking_id },
      })
      .then(() => {}, () => {});

    return {
      redirectUrl: submit.redirect_url,
      orderTrackingId: submit.order_tracking_id,
      merchantReference,
    };
  });

