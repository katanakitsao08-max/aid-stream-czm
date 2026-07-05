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
    const [{ ensureIPN, submitOrder, pesapalEnvName }, { supabaseAdmin }] = await Promise.all([
      import("./pesapal.server"),
      import("@/integrations/supabase/client.server"),
    ]);

    const { data: kase, error: caseErr } = await supabase
      .from("welfare_events")
      .select("id, title, status")
      .eq("id", data.caseId)
      .maybeSingle();
    if (caseErr) throw new Error(caseErr.message);
    if (!kase) throw new Error("Case not found");
    if (kase.status && !["active", "open", "draft"].includes(String(kase.status))) {
      throw new Error("This case is closed and no longer accepting contributions.");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, phone")
      .eq("id", userId)
      .maybeSingle();

    // Reject duplicate active submission (mirrors the DB partial-unique behavior)
    const { data: dup } = await supabase
      .from("contributions")
      .select("id, status")
      .eq("event_id", data.caseId)
      .eq("contributor_id", userId)
      .in("status", ["pending", "approved", "confirmed", "verification_requested"])
      .maybeSingle();
    if (dup) throw new Error("You already have a submission for this case.");

    const host = getRequestHost();
    const proto = getRequestHeader("x-forwarded-proto") ?? "https";
    const baseUrl = `${proto}://${host}`;

    const notificationId = await ensureIPN(baseUrl);
    const merchantReference = `wf-${data.caseId.slice(0, 8)}-${userId.slice(0, 8)}-${Date.now().toString(36)}`;

    // Get auth user for email
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);

    const submit = await submitOrder({
      merchantReference,
      amount: data.amount,
      description: `Welfare: ${kase.title ?? "contribution"}`.slice(0, 100),
      callbackUrl: `${baseUrl}/api/public/pesapal-callback`,
      notificationId,
      email: authUser?.user?.email ?? null,
      phone: data.phone ?? profile?.phone ?? null,
      firstName: (profile?.full_name ?? "").split(" ")[0] || null,
      lastName: (profile?.full_name ?? "").split(" ").slice(1).join(" ") || null,
    });

    const { error: insErr } = await supabaseAdmin.from("pesapal_transactions").insert({
      merchant_reference: merchantReference,
      order_tracking_id: submit.order_tracking_id,
      environment: pesapalEnvName(),
      case_id: data.caseId,
      contributor_id: userId,
      amount: data.amount,
      currency: "KES",
      status: "PENDING",
      redirect_url: submit.redirect_url,
      raw_submit: submit as unknown as Record<string, unknown>,
    });
    if (insErr) throw new Error(insErr.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userId,
      action: "pesapal.initiate",
      entity_type: "pesapal_transaction",
      entity_id: merchantReference,
      metadata: { case_id: data.caseId, amount: data.amount, order_tracking_id: submit.order_tracking_id },
    }).then(() => {}, () => {});

    return {
      redirectUrl: submit.redirect_url,
      orderTrackingId: submit.order_tracking_id,
      merchantReference,
    };
  });
