// Pesapal API helpers — server-only. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PESAPAL_ENV = (process.env.PESAPAL_ENV ?? "live").toLowerCase();
export const PESAPAL_BASE =
  PESAPAL_ENV === "sandbox"
    ? "https://cybqa.pesapal.com/pesapalv3"
    : "https://pay.pesapal.com/v3";

export function pesapalEnvName() {
  return PESAPAL_ENV;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getPesapalToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) return cachedToken.token;

  const consumer_key = process.env.PESAPAL_CONSUMER_KEY;
  const consumer_secret = process.env.PESAPAL_CONSUMER_SECRET;
  if (!consumer_key || !consumer_secret) {
    throw new Error("Missing PESAPAL_CONSUMER_KEY / PESAPAL_CONSUMER_SECRET");
  }

  const res = await fetch(`${PESAPAL_BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key, consumer_secret }),
  });
  const data = (await res.json()) as { token?: string; expiryDate?: string; error?: unknown };
  if (!res.ok || !data.token) {
    throw new Error(`Pesapal auth failed: ${JSON.stringify(data)}`);
  }
  const expiresAt = data.expiryDate ? Date.parse(data.expiryDate) : now + 4 * 60_000;
  cachedToken = { token: data.token, expiresAt };
  return data.token;
}

async function pesapalFetch<T>(path: string, init: RequestInit & { asJson?: unknown } = {}): Promise<T> {
  const token = await getPesapalToken();
  const res = await fetch(`${PESAPAL_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.asJson !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.asJson !== undefined ? JSON.stringify(init.asJson) : (init.body as BodyInit | undefined),
  });
  const text = await res.text();
  let data: unknown;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Pesapal ${path} failed: ${text}`);
  return data as T;
}

type RegisterIPNResp = { ipn_id: string; url: string; created_date?: string; error?: unknown };

const ipnCache = new Map<string, string>(); // key: `${env}|${url}` -> ipn_id

export async function ensureIPN(baseUrl: string): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/public/pesapal-ipn`;
  const env = pesapalEnvName();
  const cacheKey = `${env}|${url}`;
  const cached = ipnCache.get(cacheKey);
  if (cached) return cached;

  const existing = await supabaseAdmin
    .from("pesapal_ipns")
    .select("ipn_id")
    .eq("environment", env)
    .eq("url", url)
    .maybeSingle();
  if (existing.data?.ipn_id) {
    ipnCache.set(cacheKey, existing.data.ipn_id);
    return existing.data.ipn_id;
  }

  const resp = await pesapalFetch<RegisterIPNResp>("/api/URLSetup/RegisterIPN", {
    method: "POST",
    asJson: { url, ipn_notification_type: "GET" },
  });
  if (!resp.ipn_id) throw new Error(`IPN registration failed: ${JSON.stringify(resp)}`);

  await supabaseAdmin.from("pesapal_ipns").insert({
    environment: env, url, ipn_id: resp.ipn_id, notification_type: "GET",
  });
  ipnCache.set(cacheKey, resp.ipn_id);
  return resp.ipn_id;
}

export type SubmitOrderInput = {
  merchantReference: string;
  amount: number;
  description: string;
  callbackUrl: string;
  notificationId: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type SubmitOrderResp = {
  order_tracking_id: string;
  merchant_reference: string;
  redirect_url: string;
  status?: string;
  error?: unknown;
};

export async function submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResp> {
  return pesapalFetch<SubmitOrderResp>("/api/Transactions/SubmitOrderRequest", {
    method: "POST",
    asJson: {
      id: input.merchantReference,
      currency: "KES",
      amount: Number(input.amount.toFixed(2)),
      description: input.description.slice(0, 100),
      callback_url: input.callbackUrl,
      notification_id: input.notificationId,
      billing_address: {
        email_address: input.email ?? undefined,
        phone_number: input.phone ?? undefined,
        first_name: input.firstName ?? undefined,
        last_name: input.lastName ?? undefined,
      },
    },
  });
}

export type TxStatus = {
  payment_method?: string;
  amount?: number;
  created_date?: string;
  confirmation_code?: string;
  payment_status_description?: string;
  description?: string;
  message?: string;
  payment_account?: string;
  call_back_url?: string;
  status_code?: number;
  merchant_reference?: string;
  payment_status_code?: string;
  currency?: string;
  error?: { error_type?: string; code?: string; message?: string } | null;
  status?: string;
};

export async function getTransactionStatus(orderTrackingId: string): Promise<TxStatus> {
  return pesapalFetch<TxStatus>(
    `/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
  );
}
