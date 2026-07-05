// Callback URL — where the user lands after Pesapal's hosted checkout.
// We verify status server-side (do NOT trust the URL alone), then bounce
// the user back into the app to the case detail page.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/pesapal-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const orderTrackingId =
          url.searchParams.get("OrderTrackingId") ?? url.searchParams.get("orderTrackingId");
        const merchantReference =
          url.searchParams.get("OrderMerchantReference") ?? url.searchParams.get("merchantReference");

        let statusText = "unknown";
        let caseId: string | null = null;

        if (orderTrackingId) {
          try {
            const { processPesapalUpdate } = await import("@/lib/pesapal-process.server");
            const result = await processPesapalUpdate(orderTrackingId);
            statusText = result.status.toLowerCase();
          } catch (err) {
            console.error("[pesapal-callback] verify failed", err);
            statusText = "error";
          }

          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin
              .from("pesapal_transactions")
              .select("case_id")
              .eq("order_tracking_id", orderTrackingId)
              .maybeSingle();
            caseId = data?.case_id ?? null;
          } catch { /* ignore */ }
        }

        const target = caseId
          ? `/events/${caseId}?payment=${encodeURIComponent(statusText)}${merchantReference ? `&ref=${encodeURIComponent(merchantReference)}` : ""}`
          : `/dashboard?payment=${encodeURIComponent(statusText)}`;

        throw redirect({ href: target });
      },
    },
  },
});
