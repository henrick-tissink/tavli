"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import {
  listVerifiedTotpFactors,
  countUnconsumedRecoveryCodes,
  consumeRecoveryCode,
} from "@/lib/auth/mfa";
import { readImpersonationReturnCookie } from "@/lib/auth/impersonation-cookie";
import { stopImpersonationSession } from "@/lib/auth/impersonation-session";
import { isLocale } from "@/lib/i18n/locale";
import { setLocaleCookie } from "@/lib/i18n/cookie";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export type PartnerSignInResult =
  | { ok: false; error: string }
  | {
      ok: false;
      state: "needs_mfa";
      factorId: string;
      hasRecoveryCodes: boolean;
      error?: string;
    };

export async function signInPartner(
  _prev: PartnerSignInResult | undefined,
  formData: FormData,
): Promise<PartnerSignInResult> {
  const errors = getMessages(await resolveAppLocale(), "partner.onboarding").auth.errors;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { ok: false, error: errors.supabaseNotConfigured };
  }

  const mfaCode = formData.get("mfa_code");
  const recoveryCode = formData.get("recovery_code");
  const factorId = String(formData.get("factor_id") ?? "");

  // Step 2 — MFA challenge or recovery-code consumption.
  // If factor_id is present we're in the MFA step. Even if the user submitted
  // with empty inputs we must re-render needs_mfa rather than fall through to
  // the password branch (which would lose their step state).
  if (factorId) {
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return { ok: false, error: errors.sessionExpired };
    }

    if (!mfaCode && !recoveryCode) {
      const remaining = await countUnconsumedRecoveryCodes(userData.user.id);
      return {
        ok: false,
        state: "needs_mfa",
        factorId,
        hasRecoveryCodes: remaining > 0,
        error: errors.enterCode,
      };
    }

    // Fetch locale once for both MFA success branches (best-effort; skip if unavailable).
    const { data: mfaProfile } = await supabase
      .from("profiles")
      .select("locale")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (mfaCode) {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) {
        return {
          ok: false,
          state: "needs_mfa",
          factorId,
          hasRecoveryCodes: false,
          error: errors.challengeFailed,
        };
      }
      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: String(mfaCode),
      });
      if (verify.error) {
        return {
          ok: false,
          state: "needs_mfa",
          factorId,
          hasRecoveryCodes: false,
          error: errors.incorrectCode,
        };
      }
      // Sync locale cookie on successful MFA sign-in.
      if (mfaProfile?.locale && isLocale(mfaProfile.locale)) {
        await setLocaleCookie(mfaProfile.locale);
      }
      redirect("/partner");
    } else if (recoveryCode) {
      const adminClient = createSupabaseAdminClient();
      const result = await consumeRecoveryCode(
        userData.user.id,
        String(recoveryCode),
        adminClient,
        "venue_owner",
      );
      if (!result.ok) {
        return {
          ok: false,
          state: "needs_mfa",
          factorId,
          hasRecoveryCodes: true,
          error: errors.invalidRecoveryCode,
        };
      }
      // Sync locale cookie on successful recovery-code sign-in.
      if (mfaProfile?.locale && isLocale(mfaProfile.locale)) {
        await setLocaleCookie(mfaProfile.locale);
      }
      redirect("/partner/security?enrol=recommended");
    }
  }

  // Step 1 — email + password.
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, error: errors.emailPasswordRequired };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return { ok: false, error: errors.invalidCredentials };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, locale")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile?.role !== "restaurant_owner" && profile?.role !== "admin") {
    await supabase.auth.signOut();
    return { ok: false, error: errors.notPartnerAccount };
  }

  const factors = await listVerifiedTotpFactors(supabase);
  if (factors.length > 0) {
    const remaining = await countUnconsumedRecoveryCodes(data.user.id);
    return {
      ok: false,
      state: "needs_mfa",
      factorId: factors[0].id,
      hasRecoveryCodes: remaining > 0,
    };
  }

  // Sync locale cookie from profile on successful sign-in (additive — no MFA path).
  if (profile.locale && isLocale(profile.locale)) {
    await setLocaleCookie(profile.locale);
  }
  redirect("/partner");
}

export async function signOutPartner(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    redirect("/partner/sign-in");
  }
  // If currently impersonating, route through stop so admin's session
  // is restored (otherwise admin would have a dangling return cookie).
  const cookie = await readImpersonationReturnCookie();
  if (cookie) {
    await stopImpersonationSession();
    return;
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/partner/sign-in");
}
