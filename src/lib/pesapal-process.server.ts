// Processes a Pesapal transaction status update. Idempotent + duplicate-safe.
// Only server-side callers (IPN, callback) invoke this.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getTransactionStatus, type TxStatus } from "./pesapal.server";

export type ProcessResult = {
  handled: boolean;
  status: string;
  contributionId?: string;
  merchantReference?: string;
};

export async function processPesapalUpdate(orderTrackingId: string): Promise<ProcessResult> {
  if (!orderTrackingId) return { handled: false, status: "NO_ID" };

  const status: TxStatus = await getTransactionStatus(orderTrackingId);
  const description = (status.payment_status_description ?? status.status ?? "").toUpperCase();

  const { data: tx, error } = await supabaseAdmin
    .from("pesapal_transactions")
    .select("*")
    .eq("order_tracking_id", orderTrackingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!tx) {
    await supabaseAdmin.from("audit_logs").insert({
      action: "pesapal.unknown_tracking_id",
      entity_type: "pesapal_transaction",
      entity_id: orderTrackingId,
      metadata: { status: description },
    });
    return { handled: false, status: description };
  }

  // Reject duplicate confirmation codes across the ledger
  if (status.confirmation_code && description === "COMPLETED") {
    const { data: dup } = await supabaseAdmin
      .from("pesapal_transactions")
      .select("id")
      .eq("confirmation_code", status.confirmation_code)
      .neq("id", tx.id)
      .maybeSingle();
    if (dup) {
      await supabaseAdmin
        .from("pesapal_transactions")
        .update({
          status: "REJECTED_DUPLICATE",
          last_error: `Duplicate confirmation ${status.confirmation_code}`,
          raw_status: JSON.parse(JSON.stringify(status)),
        })
        .eq("id", tx.id);
      return { handled: true, status: "REJECTED_DUPLICATE", merchantReference: tx.merchant_reference };
    }
  }

  const patch: Record<string, unknown> = {
    status: description || tx.status,
    status_code: status.status_code ?? null,
    payment_method: status.payment_method ?? null,
    confirmation_code: status.confirmation_code ?? null,
    raw_status: JSON.parse(JSON.stringify(status)),
  };

  let contributionId: string | undefined = tx.contribution_id ?? undefined;

  if (description === "COMPLETED" && !tx.contribution_id && tx.case_id && tx.contributor_id) {
    // Auto-create + auto-approve the contribution (Pesapal has confirmed the money moved)
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("contributions")
      .insert({
        event_id: tx.case_id,
        contributor_id: tx.contributor_id,
        amount: tx.amount,
        status: "approved",
        mpesa_code: status.confirmation_code ?? tx.merchant_reference,
        payment_date: (status.created_date ?? new Date().toISOString()).slice(0, 10),
        notes: `Auto-approved via Pesapal (${status.payment_method ?? "online"})`,
        reviewed_at: new Date().toISOString(),
      } as never)
      .select("id")
      .single();
    if (insErr) {
      patch.last_error = insErr.message;
    } else {
      contributionId = inserted.id;
      patch.contribution_id = inserted.id;

      await supabaseAdmin.from("notifications").insert({
        user_id: tx.contributor_id,
        type: "contribution.approved",
        title: "Contribution received",
        body: `Your payment of KES ${Number(tx.amount).toLocaleString()} was received and approved.`,
        case_id: tx.case_id,
        contribution_id: inserted.id,
      }).then(() => {}, () => {});
    }
  }

  await supabaseAdmin.from("pesapal_transactions").update(patch as never).eq("id", tx.id);

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: tx.contributor_id,
    action: `pesapal.${description.toLowerCase() || "update"}`,
    entity_type: "pesapal_transaction",
    entity_id: tx.merchant_reference,
    metadata: {
      order_tracking_id: orderTrackingId,
      confirmation_code: status.confirmation_code ?? null,
      amount: tx.amount,
    },
  }).then(() => {}, () => {});

  return {
    handled: true,
    status: description,
    contributionId,
    merchantReference: tx.merchant_reference,
  };
}
