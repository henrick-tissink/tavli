"use server";

/**
 * §01 — diner self-serve sign-up.
 *
 * Replaces a client-side `supabase.auth.signUp()`, which let Supabase mail its
 * stock English template from noreply@mail.app.supabase.io using the dashboard
 * Site URL. Account creation now happens service-side via `generateLink`, and
 * Tavli sends its own branded, localised email through Resend — the same
 * mechanism the partner path uses.
 *
 * Moving off `signUp` also removes Supabase's own signup throttling, so the
 * rate limits below are the only abuse control on this endpoint. There is no
 * captcha anywhere in the codebase yet.
 */

import { headers } from "next/headers";
import { render } from "@react-email/render";
import { eq } from "drizzle-orm";
import { dbAdmin, createSupabaseAdminClient } from "@/lib/db/admin";
import { profiles } from "@/lib/db/schema";
import { enforceRateLimit } from "@/lib/rate-limit/enforce";
import { appOrigin } from "@/lib/app-origin";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { ConsumerVerifyEmail, getSubject } from "@/emails/ConsumerVerifyEmail";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

/** `error` is a key under `profile.auth.errors`; the surface translates it. */
export interface ConsumerSignUpResult {
  ok: boolean;
  error?: "generic" | "rateLimited" | "invalidEmail" | "passwordTooShort";
}

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Matches the client gate the sheet has always enforced. */
const MIN_PASSWORD = 6;

async function mailVerification(
  to: string,
  locale: Locale,
  verifyUrl: string,
): Promise<void> {
  const node = ConsumerVerifyEmail({ verifyUrl, locale });
  const html = await render(node);
  const text = await render(node, { plainText: true });
  const res = await sendTransactionalEmail({
    to,
    locale,
    templateKey: "consumer_verify",
    subject: getSubject(locale),
    html,
    text,
    context: {},
  });
  // sendTransactionalEmail REPORTS failure, it does not throw. Ignoring the
  // result made a silent outage: with PLATFORM_ORG_ID unset it bails before
  // ever calling Resend, so signups looked fine and no email was sent.
  if (!res.ok) {
    throw new Error(`transactional send failed: ${res.error ?? "unknown"}`);
  }
}

/**
 * The address is already registered. If that account is still unconfirmed,
 * treat the retry as a resend — otherwise a failed first send would strand the
 * diner permanently, since retrying signup can only ever hit this same branch
 * and there is no diner-facing resend screen.
 *
 * Sends nothing for an already-confirmed account: a "confirm your email" note
 * would be both wrong and a signal that the address exists.
 */
async function resendIfUnconfirmed(email: string, locale: Locale): Promise<void> {
  const [row] = await dbAdmin
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);
  if (!row) return;

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.auth.admin.getUserById(row.id);
  if (!existing?.user || existing.user.email_confirmed_at) return;

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${appOrigin()}/auth/callback` },
  });
  const verifyUrl = data?.properties?.action_link;
  if (error || !verifyUrl) return;
  await mailVerification(email, locale, verifyUrl);
}

export async function consumerSignUpAction(input: {
  email: string;
  password: string;
  locale: string;
}): Promise<ConsumerSignUpResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RX.test(email)) return { ok: false, error: "invalidEmail" };
  if (input.password.length < MIN_PASSWORD) {
    return { ok: false, error: "passwordTooShort" };
  }
  const locale: Locale = isLocale(input.locale) ? input.locale : DEFAULT_LOCALE;

  // Per-IP and per-email both: the IP limit is skipped entirely behind a proxy
  // that drops x-forwarded-for, and the email limit stops one address being
  // hammered from a botnet.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  if (ip) {
    const perIp = await enforceRateLimit({
      key: `consumer-signup:${ip}`,
      scope: "consumer_signup_per_ip",
    });
    if (!perIp.allowed) return { ok: false, error: "rateLimited" };
  }
  const perEmail = await enforceRateLimit({
    key: `consumer-signup:${email}`,
    scope: "consumer_signup_per_email",
  });
  if (!perEmail.allowed) return { ok: false, error: "rateLimited" };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password: input.password,
    options: {
      data: { locale },
      redirectTo: `${appOrigin()}/auth/callback`,
    },
  });

  const verifyUrl = data?.properties?.action_link;
  if (error || !data?.user || !verifyUrl) {
    // Almost always "email already registered". Returning the same
    // check-your-email result as a fresh signup keeps this from becoming an
    // enumeration oracle — the old client-side signUp leaked this via a raw
    // Supabase error string rendered straight into the UI.
    try {
      await resendIfUnconfirmed(email, locale);
    } catch (err) {
      console.error("[consumer-signup] resend probe failed:", err);
    }
    return { ok: true };
  }

  // The on_auth_user_created trigger already committed the profiles row, and it
  // does not read raw_user_meta_data — so the locale passed above never reaches
  // the row and it would sit at the 'ro' column default. Set it explicitly.
  try {
    await dbAdmin
      .update(profiles)
      .set({ locale })
      .where(eq(profiles.id, data.user.id));
  } catch (err) {
    console.error("[consumer-signup] locale update failed:", err);
  }

  try {
    await mailVerification(email, locale, verifyUrl);
  } catch (err) {
    // The account exists either way; a retry now routes through
    // resendIfUnconfirmed, so this is recoverable rather than terminal.
    console.error("[consumer-signup] verification email failed:", err);
  }

  return { ok: true };
}
