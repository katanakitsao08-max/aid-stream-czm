// Pesapal IPN endpoint. Pesapal issues GET (default) with query params:
//   ?OrderTrackingId=...&OrderMerchantReference=...&OrderNotificationType=IPNCHANGE
// We MUST respond with JSON echoing the params + a numeric status.
import { createFileRoute } from "@tanstack/react-router";

async function handle(request: Request) {
  const url = new URL(request.url);
  let orderTrackingId = url.searchParams.get("OrderTrackingId") ?? url.searchParams.get("orderTrackingId");
  let merchantReference = url.searchParams.get("OrderMerchantReference") ?? url.searchParams.get("merchantReference");
  const notificationType = url.searchParams.get("OrderNotificationType") ?? "IPNCHANGE";

  if (!orderTrackingId && request.method === "POST") {
    try {
      const body = (await request.json()) as Record<string, string | undefined>;
      orderTrackingId = orderTrackingId ?? body.OrderTrackingId ?? body.orderTrackingId ?? null;
      merchantReference = merchantReference ?? body.OrderMerchantReference ?? body.merchantReference ?? null;
    } catch { /* ignore */ }
  }

  const payload = {
    orderNotificationType: notificationType,
    orderTrackingId: orderTrackingId ?? "",
    orderMerchantReference: merchantReference ?? "",
    status: 200,
  };

  if (!orderTrackingId) {
    return Response.json({ ...payload, status: 500 }, { status: 200 });
  }

  try {
    const { processPesapalUpdate } = await import("@/lib/pesapal-process.server");
    await processPesapalUpdate(orderTrackingId);
    return Response.json(payload, { status: 200 });
  } catch (err) {
    console.error("[pesapal-ipn] processing failed", err);
    return Response.json({ ...payload, status: 500 }, { status: 200 });
  }
}

export const Route = createFileRoute("/api/public/pesapal-ipn")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
