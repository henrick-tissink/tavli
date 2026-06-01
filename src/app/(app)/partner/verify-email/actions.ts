"use server";

import { createSupabaseServerClient } from "@/lib/db/server";
import { enforceRateLimit } from "@/lib/rate-limit/enforce";

export interface ResendResult {
  ok: boolean;
  error?: string;
}

/**
 * §01 §5.3 — re-send the email-verification link. Rate-limited at 3/10min per
 * email (scope `auth_resend_verification`). Uses Supabase's own confirmation
 * email (auth.resend), which handles token generation + delivery.
 */
export async function resendVerificationAction(
  _prev: ResendResult | undefined,
  formData: FormData,
): Promise<ResendResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, error: "invalid" };

  const rl = await enforceRateLimit({ key: `resend-verify:${email}`, scope: "auth_resend_verification" });
  if (!rl.allowed) return { ok: false, error: "rate_limited" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) return { ok: false, error: "send_failed" };
  return { ok: true };
}
