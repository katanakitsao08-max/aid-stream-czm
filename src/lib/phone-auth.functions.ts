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
 * When multiple profiles share the same phone (e.g. an admin originally
 * created with a real email, plus a later phone-only signup that duplicated
 * the number), prefer the account with a real email address over the
 * synthesized `@czmt.local` one.
 */
export const resolveEmailForPhone = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const synthetic = `${data.phone}@czmt.local`;
    const local = data.phone.startsWith("254") ? "0" + data.phone.slice(3) : data.phone;

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .or(`phone.eq.${data.phone},phone.eq.${local}`);

    const emails: string[] = [];
    for (const p of profiles ?? []) {
      if (!p.user_id) continue;
      const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(p.user_id);
      const email = userRes?.user?.email;
      if (email) emails.push(email);
    }

    // Prefer a real email over the synthesized @czmt.local one.
    const real = emails.find((e) => !e.endsWith("@czmt.local"));
    if (real) return { email: real };
    if (emails[0]) return { email: emails[0] };

    return { email: synthetic };
  });
