/**
 * §01 §5a.3 phase 2 sub-unit B — startImpersonationSession.
 *
 * Real-session-swap mechanism. The admin's session tokens are captured
 * before signOut so a return ticket (the encrypted cookie) can restore
 * them on stop. If verifyOtp fails after we've already signed the admin
 * out, we attempt to restore the admin session via setSession before
 * throwing — failing closed (admin signed out, no audit) is preferable
 * to silently swallowing the failure.
 *
 * DI seam: deps argument lets tests inject mock Supabase clients +
 * cookie store. Production callers pass nothing and the helper resolves
 * everything from next/headers + module factories at call time.
 */

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { encryptAesGcm, decryptAesGcm } from "./crypto";
import {
  IMPERSONATION_COOKIE_NAME,
  type ImpersonationReturnPayload,
} from "./impersonation-cookie";
import {
  recordImpersonationStart,
  recordImpersonationEnd,
} from "./impersonation";

interface CookieStore {
  set: (name: string, value: string, options: object) => void;
  delete: (name: string) => void;
  get?: (name: string) => { value: string } | undefined;
}

export interface StartImpersonationDeps {
  supabase: SupabaseClient;
  adminClient: SupabaseClient;
  cookieStore: CookieStore;
}

function getKey(): string {
  const key = process.env.IMPERSONATION_COOKIE_SECRET;
  if (!key) throw new Error("IMPERSONATION_COOKIE_SECRET not set.");
  return key;
}

/**
 * Start a real-session-swap impersonation. Admin must be AAL2; target must
 * exist; no self-impersonation. Captures admin's session tokens for the
 * return ticket, signs admin out, mints a target session via service-role
 * magic link, sets the encrypted return cookie, audits, redirects to /partner.
 *
 * If verifyOtp fails post-signOut, attempts to restore admin via setSession
 * before throwing.
 */
export async function startImpersonationSession(
  targetUserId: string,
  reason?: string,
  deps?: Partial<StartImpersonationDeps>,
): Promise<void> {
  const supabase = deps?.supabase ?? (await createSupabaseServerClient());
  const adminClient = deps?.adminClient ?? createSupabaseAdminClient();
  const cookieStore = deps?.cookieStore ?? (await cookies());

  // 1. Authenticated admin
  const { data: userData } = await supabase.auth.getUser();
  const adminUser = userData?.user;
  if (!adminUser) throw new Error("Not signed in.");

  // 2. Admin role + AAL2
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", adminUser.id)
    .maybeSingle();
  if (profile?.role !== "admin") throw new Error("Admin role required.");
  const { data: aalData } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalData?.currentLevel !== "aal2") throw new Error("AAL2 required.");

  // 3. No self-impersonation
  if (targetUserId === adminUser.id) {
    throw new Error("Refusing self-impersonation.");
  }

  // 4. Capture admin session tokens
  const { data: sessionData } = await supabase.auth.getSession();
  const adminAccessToken = sessionData?.session?.access_token;
  const adminRefreshToken = sessionData?.session?.refresh_token;
  if (!adminAccessToken || !adminRefreshToken) {
    throw new Error("Could not capture admin session.");
  }

  // 5. Look up target
  const { data: targetData } =
    await adminClient.auth.admin.getUserById(targetUserId);
  const target = targetData?.user;
  if (!target || !target.email) throw new Error("Target user not found.");

  // 6. Generate magic link (admin API does NOT send email; returns hashed_token only).
  const { data: linkData } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email: target.email,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash) throw new Error("Magic link generation failed.");

  // 7. Clear org-context cookie before swap
  cookieStore.delete("tavli_active_org");

  // 8. Sign out admin
  await supabase.auth.signOut();

  // 9. Verify OTP → mints target session, sets target cookies
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (verifyError) {
    // Restore admin session
    if (supabase.auth.setSession) {
      await supabase.auth.setSession({
        access_token: adminAccessToken,
        refresh_token: adminRefreshToken,
      });
    }
    throw new Error("Impersonation swap failed.");
  }

  // 10. Audit (only after swap succeeds)
  await recordImpersonationStart({
    adminUserId: adminUser.id,
    targetUserId,
    reason,
  });

  // 11. Encrypt + set return cookie
  const payload: ImpersonationReturnPayload = {
    v: 1,
    adminUserId: adminUser.id,
    adminEmail: adminUser.email ?? "",
    targetUserId,
    targetEmail: target.email,
    startedAt: new Date().toISOString(),
    adminAccessToken,
    adminRefreshToken,
  };
  const encrypted = encryptAesGcm(JSON.stringify(payload), getKey());
  cookieStore.set(IMPERSONATION_COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 4 * 60 * 60,
  });

  redirect("/partner");
}

// ─── stop ─────────────────────────────────────────────────────────────────

export interface StopImpersonationDeps {
  supabase: SupabaseClient;
  cookieStore: CookieStore;
}

/**
 * Stop an active impersonation session and restore the admin's original
 * session using the return-ticket cookie's encrypted admin tokens.
 *
 * Failure modes:
 * - No cookie / decrypt fails → clear cookie, signOut target, redirect to
 *   /admin/sign-in?session_expired=1 (admin re-signs-in including MFA).
 * - setSession fails with the admin tokens (stale refresh chain) → same.
 *
 * Note: the audit row writes BEFORE setSession so even if restoration
 * fails, the end of impersonation is recorded (paired with the start).
 */
export async function stopImpersonationSession(
  deps?: Partial<StopImpersonationDeps>,
): Promise<void> {
  const supabase = deps?.supabase ?? (await createSupabaseServerClient());
  const cookieStore = deps?.cookieStore ?? (await cookies());

  const raw = cookieStore.get?.(IMPERSONATION_COOKIE_NAME)?.value;
  if (!raw) {
    await supabase.auth.signOut();
    redirect("/admin/sign-in?session_expired=1");
  }

  const decrypted = decryptAesGcm(raw, getKey());
  let payload: ImpersonationReturnPayload | null = null;
  if (decrypted) {
    try {
      payload = JSON.parse(decrypted) as ImpersonationReturnPayload;
    } catch {
      // fallthrough to handler below
    }
  }
  if (!payload) {
    cookieStore.delete(IMPERSONATION_COOKIE_NAME);
    redirect("/admin/sign-in?session_expired=1");
  }

  // Audit BEFORE the restoration attempt — pair with the start row even
  // if restoration fails.
  await recordImpersonationEnd({
    adminUserId: payload.adminUserId,
    targetUserId: payload.targetUserId,
  });

  // Clear target session
  await supabase.auth.signOut();

  // Restore admin
  const { error } = await supabase.auth.setSession({
    access_token: payload.adminAccessToken,
    refresh_token: payload.adminRefreshToken,
  });
  if (error) {
    cookieStore.delete(IMPERSONATION_COOKIE_NAME);
    redirect("/admin/sign-in?session_expired=1");
  }

  cookieStore.delete(IMPERSONATION_COOKIE_NAME);
  redirect("/admin/users");
}
