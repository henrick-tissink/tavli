/**
 * Email OTP helper. Wraps Supabase Auth `signInWithOtp` so the rest of the
 * app can request a magic-link without knowing about Supabase plumbing.
 *
 * For corporate-bookings Phase 1: the OTP redirect carries the event-request
 * tracking token so `/auth/callback` can promote the matching `draft` row
 * to `new` once the user verifies (Task 10).
 */

import { createSupabaseServerClient } from "@/lib/db/server";
import { appOrigin } from "@/lib/app-origin";

export interface SendOtpInput {
  email: string;
  redirectToToken: string;
}

export async function sendOtp({ email, redirectToToken }: SendOtpInput): Promise<{ ok: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${appOrigin()}/auth/callback?token=${encodeURIComponent(redirectToToken)}`,
      data: { event_request_token: redirectToToken },
    },
  });
  if (error) throw error;
  return { ok: true };
}
