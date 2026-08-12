"use server";

import { render } from "@react-email/render";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { enforceRateLimit } from "@/lib/rate-limit/enforce";
import { appOrigin } from "@/lib/app-origin";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { PartnerVerifyEmail, getSubject } from "@/emails/PartnerVerifyEmail";

export interface ResendResult {
  ok: boolean;
  error?: string;
}

/**
 * Ask Supabase for a confirmation link without sending anything. `signup` is
 * not usable here — the user already exists and that type demands a password
 * we only hold hashed — so we mint a magic link instead. Consuming it also
 * confirms the address, and `/auth/callback` confirms explicitly as a backstop
 * in case a given GoTrue version does not.
 *
 * Returns null on any failure so the caller can fall back to Supabase's own
 * mailer rather than leaving the operator with no email.
 */
async function generateVerifyLink(email: string): Promise<string | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${appOrigin()}/auth/callback` },
    });
    if (error) return null;
    return data?.properties?.action_link ?? null;
  } catch {
    return null;
  }
}

/**
 * §01 §5.3 — re-send the email-verification link. Rate-limited at 3/10min per
 * email (scope `auth_resend_verification`).
 *
 * Preferred path mails our own branded, localised `PartnerVerifyEmail` through
 * Resend, matching the message sent at sign-up. If the link cannot be minted or
 * the send fails we fall back to `auth.resend()`, which uses Supabase's stock
 * template — uglier and English-only, but better than a dead button.
 *
 * `emailRedirectTo` on that fallback only applies if the URL is in the
 * project's Redirect URLs allowlist; Supabase silently substitutes the
 * dashboard Site URL otherwise.
 */
export async function resendVerificationAction(
  _prev: ResendResult | undefined,
  formData: FormData,
): Promise<ResendResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, error: "invalid" };

  const rl = await enforceRateLimit({ key: `resend-verify:${email}`, scope: "auth_resend_verification" });
  if (!rl.allowed) return { ok: false, error: "rate_limited" };

  const locale = await resolveAppLocale();
  const verifyUrl = await generateVerifyLink(email);

  if (verifyUrl) {
    try {
      // No fullName here: the resend page has no sign-up context, and the
      // template drops the salutation rather than guessing.
      const node = PartnerVerifyEmail({ verifyUrl, locale });
      const html = await render(node);
      const text = await render(node, { plainText: true });
      const sent = await sendTransactionalEmail({
        to: email,
        locale,
        templateKey: "partner_verify",
        subject: getSubject(locale),
        html,
        text,
        context: {},
      });
      // It reports failure rather than throwing, so the catch below never saw
      // it and the Supabase fallback never fired — the operator got nothing.
      if (!sent.ok) {
        throw new Error(`transactional send failed: ${sent.error ?? "unknown"}`);
      }
      return { ok: true };
    } catch (err) {
      console.error("[verify-email] branded resend failed, falling back:", err);
    }
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${appOrigin()}/auth/callback` },
  });
  if (error) return { ok: false, error: "send_failed" };
  return { ok: true };
}
