"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import {
  listVerifiedTotpFactors,
  countUnconsumedRecoveryCodes,
  consumeRecoveryCode,
} from "@/lib/auth/mfa";

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
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return {
      ok: false,
      error:
        "Supabase isn't configured yet. Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
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
      return { ok: false, error: "Session expired. Please sign in again." };
    }

    if (!mfaCode && !recoveryCode) {
      const remaining = await countUnconsumedRecoveryCodes(userData.user.id);
      return {
        ok: false,
        state: "needs_mfa",
        factorId,
        hasRecoveryCodes: remaining > 0,
        error: "Enter a code to continue.",
      };
    }

    if (mfaCode) {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) {
        return {
          ok: false,
          state: "needs_mfa",
          factorId,
          hasRecoveryCodes: false,
          error: "Couldn't issue challenge. Try again.",
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
          error: "Incorrect code.",
        };
      }
      redirect("/admin");
    } else if (recoveryCode) {
      const adminClient = createSupabaseAdminClient();
      const result = await consumeRecoveryCode(
        userData.user.id,
        String(recoveryCode),
        adminClient,
      );
      if (!result.ok) {
        return {
          ok: false,
          state: "needs_mfa",
          factorId,
          hasRecoveryCodes: true,
          error: "Recovery code invalid.",
        };
      }
      redirect("/admin/security?enrol=required");
    }
  }

  // Step 1 — email + password.
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    return { ok: false, error: "Invalid credentials." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    await supabase.auth.signOut();
    return { ok: false, error: "This account isn't authorised for admin access." };
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
