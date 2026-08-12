import "server-only";

import { eq } from "drizzle-orm";
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import { profiles } from "@/lib/db/schema";
import type { createSupabaseServerClient } from "@/lib/db/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Where a user lands once an emailed link has been consumed and a session
 * exists. Shared by `/auth/confirm` (token_hash → verifyOtp) and
 * `/auth/callback` (PKCE code exchange) so the two entry points cannot drift.
 *
 * Returns a PATH; the caller resolves it against the public origin, because a
 * route handler's `req.url` carries the container's internal address behind
 * the proxy.
 */
export async function resolvePostAuthPath(supabase: ServerClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/";

  // Getting here means Supabase validated a token mailed to this address, so
  // mailbox control is proven. Magic links do not reliably stamp
  // email_confirmed_at, and an unconfirmed user is bounced straight back to
  // /partner/verify-email by the dashboard gate. Confirm explicitly so the
  // journey cannot loop.
  if (!user.email_confirmed_at) {
    try {
      const admin = createSupabaseAdminClient();
      await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
    } catch (err) {
      console.error("[auth] explicit email confirm failed:", err);
    }
  }

  const [profile] = await dbAdmin
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  // Partners land in the portal they signed up for; diners get their own
  // confirmation rather than being dropped on the storefront with no sign
  // anything happened.
  return profile?.role === "restaurant_owner" || profile?.role === "admin"
    ? "/partner/verified"
    : "/auth/verified";
}
