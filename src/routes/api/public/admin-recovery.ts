import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

const BodySchema = z.object({
  secret: z.string().min(1),
  phone: z.string().min(7),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

function normalizePhone(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
  if (digits.length === 9 && digits.startsWith("7")) return "254" + digits;
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute("/api/public/admin-recovery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.ADMIN_RECOVERY_SECRET;
        if (!expected) {
          return new Response(
            JSON.stringify({ error: "Recovery is not configured" }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Invalid input" }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        if (!safeEqual(parsed.data.secret, expected)) {
          // Small delay to slow brute-force attempts
          await new Promise((r) => setTimeout(r, 750));
          return new Response(JSON.stringify({ error: "Invalid recovery secret" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const phone = normalizePhone(parsed.data.phone);
        if (!phone) {
          return new Response(JSON.stringify({ error: "Invalid phone number" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find matching profiles by phone (either 2547... or 07... form)
        const local = "0" + phone.slice(3);
        const { data: profiles, error: profErr } = await supabaseAdmin
          .from("profiles")
          .select("user_id")
          .or(`phone.eq.${phone},phone.eq.${local}`);

        if (profErr) {
          return new Response(JSON.stringify({ error: profErr.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const candidates = (profiles ?? [])
          .map((p) => p.user_id)
          .filter((v): v is string => !!v);

        if (candidates.length === 0) {
          return new Response(
            JSON.stringify({ error: "No account found for that phone number" }),
            { status: 404, headers: { "content-type": "application/json" } },
          );
        }

        // Only allow resetting accounts that have the admin role.
        const { data: adminRoles, error: roleErr } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .in("user_id", candidates)
          .eq("role", "admin");

        if (roleErr) {
          return new Response(JSON.stringify({ error: roleErr.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        const adminIds = (adminRoles ?? []).map((r) => r.user_id);
        if (adminIds.length === 0) {
          return new Response(
            JSON.stringify({ error: "That phone number is not linked to an admin account" }),
            { status: 403, headers: { "content-type": "application/json" } },
          );
        }

        // If multiple admins match, prefer one with a real (non-synthesized) email.
        let targetId = adminIds[0];
        let targetEmail: string | null = null;
        for (const id of adminIds) {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
          const email = u?.user?.email ?? null;
          if (email && !email.endsWith("@czmt.local")) {
            targetId = id;
            targetEmail = email;
            break;
          }
          if (!targetEmail) targetEmail = email;
        }

        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
          password: parsed.data.newPassword,
        });

        if (updErr) {
          return new Response(JSON.stringify({ error: updErr.message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ ok: true, email: targetEmail }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
