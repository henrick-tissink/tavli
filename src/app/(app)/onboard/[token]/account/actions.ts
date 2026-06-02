"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { hashInvitationToken } from "@/lib/invitations";
import { validatePasswordPolicy } from "@/lib/auth/password-policy";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";

export interface CreateAccountResult {
  ok: boolean;
  error?: string;
}

export async function createAccount(
  _prev: CreateAccountResult | undefined,
  formData: FormData,
): Promise<CreateAccountResult> {
  const locale = await resolveAppLocale();
  const e = getMessages(locale, "partner.onboarding").wizard.errors;

  const token = String(formData.get("token") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!token) return { ok: false, error: e.missingToken };
  if (!email || !email.includes("@")) return { ok: false, error: e.validEmailRequired };

  // §01 §5a.1 (NIST 800-63B): length minimum + HIBP breach check via
  // k-anonymity API. HIBP fails open on transient errors per spec.
  const policyResult = await validatePasswordPolicy(password);
  if (!policyResult.ok) {
    if (policyResult.reason === "too_short") {
      return { ok: false, error: e.passwordTooShort };
    }
    if (policyResult.reason === "pwned") {
      return {
        ok: false,
        error: e.passwordPwned,
      };
    }
    return { ok: false, error: e.passwordValidationFailed };
  }

  const admin = createSupabaseAdminClient();

  // Validate invitation first so we don't create orphan users.
  const { data: invitation } = await admin
    .from("invitations")
    .select("id, email, status, expires_at")
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();

  if (!invitation) return { ok: false, error: e.invitationNotFound };
  if (invitation.status !== "pending") {
    return { ok: false, error: interpolate(e.invitationStatus, { status: invitation.status }) };
  }
  if (new Date(invitation.expires_at) < new Date()) {
    return { ok: false, error: e.invitationExpired };
  }
  if (email !== invitation.email) {
    return {
      ok: false,
      error: interpolate(e.invitationEmailMismatch, { email: invitation.email }),
    };
  }

  // Create the auth user via the service-role client so we can skip
  // email confirmation for beta partners. Future: require email confirm
  // for scaled phase.
  const { data: created, error: signUpError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (signUpError || !created.user) {
    // If user already exists, Supabase returns a specific error. We can
    // offer sign-in instead; for now just surface the error.
    return { ok: false, error: signUpError?.message ?? e.couldNotCreateAccount };
  }

  // Call the RPC to link everything together.
  const { error: rpcError } = await admin.rpc("claim_invitation", {
    p_raw_token: token,
    p_user_id: created.user.id,
    p_full_name: fullName || null,
  });

  if (rpcError) {
    // Clean up: delete the just-created user if the claim fails.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: interpolate(e.couldNotLink, { message: rpcError.message }) };
  }

  // Sign the user in via the user-scoped SSR client so the session cookie is set.
  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return {
      ok: false,
      error: interpolate(e.autoSignInFailed, { message: signInError.message }),
    };
  }

  redirect(`/onboard/${token}/profile`);
}
