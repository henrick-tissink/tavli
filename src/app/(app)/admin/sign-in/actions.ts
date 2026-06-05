"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import {
  listVerifiedTotpFactors,
  countUnconsumedRecoveryCodes,
  consumeRecoveryCode,
} from "@/lib/auth/mfa";
import { reconcileSignInLocale } from "@/lib/i18n/signin-locale";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";

export type SignInResult =
  | { ok: false; error: string }
  | {
      ok: false;
      state: "needs_mfa";
      factorId: string;
      hasRecoveryCodes: boolean;
      error?: string;
    };

export async function signInAdmin(
  _prev: SignInResult | undefined,
  formData: FormData,
): Promise<SignInResult> {
  const m = getMessages(await resolveAppLocale(), "admin.auth");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return {
      ok: false,
      error: m.errors.supabaseNotConfigured,
    };
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
      return { ok: false, error: m.errors.sessionExpired };
    }

    if (!mfaCode && !recoveryCode) {
      const remaining = await countUnconsumedRecoveryCodes(userData.user.id);
      return {
        ok: false,
        state: "needs_mfa",
        factorId,
        hasRecoveryCodes: remaining > 0,
        error: m.errors.enterCode,
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
          error: m.errors.challengeFailed,
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
          error: m.errors.incorrectCode,
        };
      }
      // Reconcile locale on successful MFA sign-in (cookie wins; see signin-locale.ts).
      await reconcileSignInLocale(userData.user.id, mfaProfile?.locale ?? null);
      redirect("/admin");
    } else if (recoveryCode) {
      const adminClient = createSupabaseAdminClient();
      const result = await consumeRecoveryCode(
        userData.user.id,
        String(recoveryCode),
        adminClient,
        "tavli_admin",
      );
      if (!result.ok) {
        return {
          ok: false,
          state: "needs_mfa",
          factorId,
          hasRecoveryCodes: true,
          error: m.errors.invalidRecoveryCode,
        };
      }
      // Reconcile locale on successful recovery-code sign-in (cookie wins; see signin-locale.ts).
      await reconcileSignInLocale(userData.user.id, mfaProfile?.locale ?? null);
      redirect("/admin/security?enrol=required");
    }
  }

  // Step 1 — email + password.
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, error: m.errors.emailPasswordRequired };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return { ok: false, error: m.errors.invalidCredentials };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, locale")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    await supabase.auth.signOut();
    return { ok: false, error: m.errors.notAuthorisedForAdmin };
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

  // Reconcile locale on successful sign-in (cookie wins; see signin-locale.ts).
  await reconcileSignInLocale(data.user.id, profile.locale);
  redirect("/admin");
}

export async function signOutAdmin(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    redirect("/admin/sign-in");
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/admin/sign-in");
}
