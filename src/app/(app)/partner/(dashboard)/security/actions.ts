"use server";

/**
 * §01 §5a.2 phase 2 sub-unit A — partner/security server actions.
 *
 * Bridges the partner /security UI to the helpers in @/lib/auth/mfa and
 * @/lib/auth/password-policy. All actions resolve the user from the cookie-
 * bound server client; callers don't pass userId.
 *
 * Password policy is enforced here (the boundary) per the comment on
 * changePassword: the helper itself is intentionally policy-agnostic so the
 * caller can localize error messages and decide how strict to be.
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  enrolTotpFactor,
  verifyTotpEnrollment,
  unenrollFactor,
  generateRecoveryCodes,
  changePassword,
  signOutEverywhere,
  makeTransientAnonClient,
} from "@/lib/auth/mfa";
import { validatePasswordPolicy } from "@/lib/auth/password-policy";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export interface ActionResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function securityErrors() {
  const locale = await resolveAppLocale();
  return getMessages(locale, "partner.staffSecurity").security.password;
}

export async function startTotpEnrolment(): Promise<
  ActionResult<{
    factorId: string;
    qrCodeSvg: string;
    uri: string;
    secret: string;
  }>
> {
  const supabase = await createSupabaseServerClient();
  const result = await enrolTotpFactor(supabase, "Authenticator app");
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    data: {
      factorId: result.factorId,
      qrCodeSvg: result.qrCodeSvg,
      uri: result.uri,
      secret: result.secret,
    },
  };
}

export async function verifyTotpStep(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const factorId = String(formData.get("factor_id") ?? "");
  const code = String(formData.get("code") ?? "");
  const e = await securityErrors();
  if (!factorId || !code) return { ok: false, error: e.errorCodeRequired };

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { ok: false, error: e.errorNotSignedIn };

  const result = await verifyTotpEnrollment(
    supabase,
    factorId,
    code,
    userData.user.id,
    "venue_owner",
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function unenrolFactorAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const factorId = String(formData.get("factor_id") ?? "");
  const e = await securityErrors();
  if (!factorId) return { ok: false, error: e.errorFactorRequired };
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { ok: false, error: e.errorNotSignedIn };
  const result = await unenrollFactor(
    supabase,
    factorId,
    userData.user.id,
    "venue_owner",
  );
  if (!result.ok) return { ok: false, error: result.error ?? e.errorCouldNotRemove };
  return { ok: true };
}

export async function regenerateRecoveryCodes(): Promise<
  ActionResult<{ codes: string[] }>
> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    const e = await securityErrors();
    return { ok: false, error: e.errorNotSignedIn };
  }
  const codes = await generateRecoveryCodes(userData.user.id, "venue_owner");
  return { ok: true, data: { codes } };
}

export async function changePasswordAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");
  const e = await securityErrors();
  if (newPassword !== confirm) {
    return { ok: false, error: e.errorMismatch };
  }

  // Enforce password policy at the boundary (changePassword itself doesn't).
  const policy = await validatePasswordPolicy(newPassword);
  if (!policy.ok) {
    return {
      ok: false,
      error:
        policy.reason === "too_short"
          ? e.errorTooShort
          : e.errorBreached,
    };
  }

  const supabase = await createSupabaseServerClient();
  const result = await changePassword(
    currentPassword,
    newPassword,
    {
      supabase,
      makeTransientClient: makeTransientAnonClient,
    },
    "venue_owner",
  );
  if (!result.ok) return { ok: false, error: result.error };
  redirect("/partner/sign-in?password_changed=1");
}

export async function signOutEverywhereAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await signOutEverywhere(supabase, "venue_owner");
  redirect("/partner/sign-in?signed_out=1");
}
