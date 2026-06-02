"use server";

/**
 * §01 §5a.2 phase 2 sub-unit A — admin/security server actions.
 *
 * Mirrors the partner /security actions but redirects to /admin/sign-in after
 * password change and sign-out-everywhere. The first four actions are
 * identical to the partner versions; duplicated here per the plan to avoid
 * cross-route import smells. Future refactor may extract a shared helper.
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
  return getMessages(locale, "admin.security").errors;
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
  if (!factorId || !code) return { ok: false, error: e.codeRequired };

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { ok: false, error: e.notSignedIn };

  const result = await verifyTotpEnrollment(
    supabase,
    factorId,
    code,
    userData.user.id,
    "tavli_admin",
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
  if (!factorId) return { ok: false, error: e.factorRequired };
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { ok: false, error: e.notSignedIn };
  const result = await unenrollFactor(
    supabase,
    factorId,
    userData.user.id,
    "tavli_admin",
  );
  if (!result.ok)
    return { ok: false, error: result.error ?? e.couldNotRemove };
  return { ok: true };
}

export async function regenerateRecoveryCodes(): Promise<
  ActionResult<{ codes: string[] }>
> {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) {
    const e = await securityErrors();
    return { ok: false, error: e.notSignedIn };
  }
  const codes = await generateRecoveryCodes(userData.user.id, "tavli_admin");
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
    return { ok: false, error: e.mismatch };
  }

  // Enforce password policy at the boundary (changePassword itself doesn't).
  const policy = await validatePasswordPolicy(newPassword);
  if (!policy.ok) {
    return {
      ok: false,
      error: policy.reason === "too_short" ? e.tooShort : e.breached,
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
    "tavli_admin",
  );
  if (!result.ok) return { ok: false, error: result.error };
  redirect("/admin/sign-in?password_changed=1");
}

export async function signOutEverywhereAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await signOutEverywhere(supabase, "tavli_admin");
  redirect("/admin/sign-in?signed_out=1");
}
