import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  phone: z.string().regex(/^254\d{9}$/, "Invalid phone"),
});

/**
 * Resolve a normalized Kenyan phone number (2547XXXXXXXX) to the email address
 * registered on the corresponding auth user. Supports both:
 *  - new phone-only signups (email = `<phone>@czmt.local`)
 *  - older accounts (e.g. admins) created with a real email but whose profile
 *    stores the phone number.
 *
 * Returns `{ email: null }` when no match — the client should show a generic
 * "invalid phone or password" message to avoid leaking which phones exist.
 */
export const resolveEmailForPhone = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Synthesized email used by the phone-only signup flow.
    const synthetic = `${data.phone}@czmt.local`;
    const local = data.phone.startsWith("254") ? "0" + data.phone.slice(3) : data.phone;

    // 2. Look up a profile that matches either the canonical 2547... form or
    //    the local 07... form (older rows may use either).
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .or(`phone.eq.${data.phone},phone.eq.${local}`)
      .maybeSingle();

    if (profile?.user_id) {
      const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
      const email = userRes?.user?.email ?? null;
      if (email) return { email };
    }

    // 3. Fall back to the synthesized address.
    return { email: synthetic };
  });
