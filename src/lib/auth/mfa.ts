/**
 * §01 §5a.2 (foundations §5.2) — TOTP MFA helper layer (phase 1).
 *
 * Thin wrappers around Supabase Auth's MFA API + audit-row writes on
 * the side-effectful operations (verify, unenrol). Callers inject the
 * server-context SupabaseClient; tests inject a structural mock.
 *
 * No sign-in enforcement here — that arrives with the /admin/security
 * + /partner/security UI follow-up. This module only provides the
 * primitives the UI will consume.
 *
 * actorRole note: MFA is a self-service flow (the user acts on their
 * own account), so the audit row's actorRole would ideally be the
 * user's effective role for some scope. We don't have a restaurant
 * context here, so the writes use `"venue_owner"` as a conservative
 * default — partner accounts in current prod are all venue_owners.
 * The UI follow-up refines this by passing the resolved role.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

export interface EnrolledFactor {
  id: string;
  friendlyName: string | null;
  status: "verified" | "unverified";
  createdAt: string;
}

export type EnrolTotpResult =
  | { ok: true; factorId: string; qrCodeSvg: string; uri: string; secret: string }
  | { ok: false; error: string };

export type VerifyTotpResult =
  | { ok: true }
  | { ok: false; error: string };

export async function enrolTotpFactor(
  supabase: SupabaseClient,
  friendlyName?: string,
): Promise<EnrolTotpResult> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName,
  });
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Enrollment failed." };
  }
  // Supabase returns `data.totp` with `qr_code` (SVG), `uri`, `secret`.
  // The shape is `{ id, type: 'totp', totp: { qr_code, secret, uri }, friendly_name }`.
  const totp = (data as { totp?: { qr_code: string; uri: string; secret: string } }).totp;
  if (!totp) {
    return { ok: false, error: "Enrollment returned no TOTP payload." };
  }
  return {
    ok: true,
    factorId: data.id,
    qrCodeSvg: totp.qr_code,
    uri: totp.uri,
    secret: totp.secret,
  };
}

export async function verifyTotpEnrollment(
  supabase: SupabaseClient,
  factorId: string,
  code: string,
  userIdForAudit: string,
): Promise<VerifyTotpResult> {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error || !challenge.data) {
    return {
      ok: false,
      error: challenge.error?.message ?? "Could not challenge factor.",
    };
  }
  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verify.error || !verify.data) {
    return {
      ok: false,
      error: verify.error?.message ?? "Verification failed.",
    };
  }
  const enrolActor = await currentActor(userIdForAudit);
  await recordAudit({
    action: AUDIT.auth.mfa_enrolled,
    subjectType: "user",
    subjectId: userIdForAudit,
    actorUserId: enrolActor.actorUserId,
    impersonatorUserId: enrolActor.impersonatorUserId ?? undefined,
    actorRole: "venue_owner",
    context: { factor_type: "totp", factor_id: factorId },
  });
  return { ok: true };
}

export async function unenrollFactor(
  supabase: SupabaseClient,
  factorId: string,
  userIdForAudit: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    return { ok: false, error: error.message };
  }
  const unenrolActor = await currentActor(userIdForAudit);
  await recordAudit({
    action: AUDIT.auth.mfa_disabled,
    subjectType: "user",
    subjectId: userIdForAudit,
    actorUserId: unenrolActor.actorUserId,
    impersonatorUserId: unenrolActor.impersonatorUserId ?? undefined,
    actorRole: "venue_owner",
    context: { factor_id: factorId },
  });
  return { ok: true };
}

export async function listVerifiedTotpFactors(
  supabase: SupabaseClient,
): Promise<EnrolledFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return [];
  const totp = data.totp ?? [];
  return totp
    .filter((f) => f.status === "verified")
    .map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      status: "verified",
      createdAt: f.created_at,
    }));
}

export async function userHasVerifiedFactor(
  supabase: SupabaseClient,
): Promise<boolean> {
  const factors = await listVerifiedTotpFactors(supabase);
  return factors.length > 0;
}

// ─── Recovery codes (§01 §5a.2 phase 2) ──────────────────────────────────

import { createHash, randomBytes } from "node:crypto";
import { eq, isNull, and, sql } from "drizzle-orm";
import { mfaRecoveryCodes } from "@/lib/db/schema";
import { dbAdmin } from "@/lib/db/admin";
import { currentActor } from "@/lib/auth/current-actor";

export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_LENGTH = 10;
const RECOVERY_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no ambiguous glyphs

function generateOneCode(): string {
  const bytes = randomBytes(RECOVERY_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
    out += RECOVERY_CODE_ALPHABET[bytes[i] % RECOVERY_CODE_ALPHABET.length];
  }
  return out;
}

function formatForDisplay(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 10)}`;
}

function hashRecoveryCode(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Generate 10 fresh recovery codes for the user, replacing any existing.
 * Returns plaintext codes ONCE — they are hashed on storage and cannot be
 * recovered after this return. Writes audit row with impersonator threading.
 */
export async function generateRecoveryCodes(userId: string): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    codes.push(generateOneCode());
  }
  await dbAdmin.transaction(async (tx) => {
    await tx.delete(mfaRecoveryCodes).where(eq(mfaRecoveryCodes.userId, userId));
    await tx.insert(mfaRecoveryCodes).values(
      codes.map((raw) => ({
        userId,
        codeHash: hashRecoveryCode(raw),
      })),
    );
  });
  const actor = await currentActor(userId);
  await recordAudit({
    action: AUDIT.user.mfa_recovery_codes_regenerated,
    subjectType: "user",
    subjectId: userId,
    actorUserId: actor.actorUserId,
    impersonatorUserId: actor.impersonatorUserId ?? undefined,
    actorRole: "venue_owner",
    context: {},
  });
  return codes.map(formatForDisplay);
}

/**
 * Count unconsumed recovery codes for the user. Used by the security page
 * to show "X of 10 codes remaining".
 */
export async function countUnconsumedRecoveryCodes(userId: string): Promise<number> {
  const rows = await dbAdmin
    .select({ count: sql<number>`count(*)::int` })
    .from(mfaRecoveryCodes)
    .where(
      and(eq(mfaRecoveryCodes.userId, userId), isNull(mfaRecoveryCodes.consumedAt)),
    );
  return rows[0]?.count ?? 0;
}

/**
 * Consume a recovery code: validate, mark consumed, unenrol ALL of the user's
 * TOTP factors (recovery code means "lost authenticator"), audit. Caller must
 * pass an `adminClient` (service-role) — Supabase Auth's admin.mfa surface
 * requires service-role privileges to mutate factors of another user (and to
 * mutate factors at all without the user's current auth context).
 *
 * After consumption the user's session is AAL1 with no factors; sign-in flow
 * routes them to /security?enrol=required (admin) or ?enrol=recommended (partner).
 */
export async function consumeRecoveryCode(
  userId: string,
  rawInput: string,
  adminClient: SupabaseClient,
): Promise<{ ok: true; remaining: number } | { ok: false }> {
  const normalized = rawInput.replace(/-/g, "").trim().toLowerCase();
  if (normalized.length !== RECOVERY_CODE_LENGTH) return { ok: false };
  const hash = hashRecoveryCode(normalized);

  const matched = await dbAdmin.transaction(async (tx) => {
    const rows = await tx
      .update(mfaRecoveryCodes)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(mfaRecoveryCodes.userId, userId),
          eq(mfaRecoveryCodes.codeHash, hash),
          isNull(mfaRecoveryCodes.consumedAt),
        ),
      )
      .returning({ id: mfaRecoveryCodes.id });
    return rows.length > 0;
  });

  if (!matched) return { ok: false };

  // Recovery code consumed → unenrol all TOTP factors (user lost their device).
  // The admin.mfa.listFactors endpoint returns `{ factors: Factor[] }` (a flat
  // list with `factor_type`), unlike the user-context `auth.mfa.listFactors`
  // which buckets by `{ totp, phone, all }`. Filter explicitly.
  const { data: factorsData } = await adminClient.auth.admin.mfa.listFactors({
    userId,
  });
  const allFactors = (factorsData?.factors ?? []) as Array<{
    id: string;
    factor_type?: string;
  }>;
  const totpFactors = allFactors.filter((f) => f.factor_type === "totp");
  for (const f of totpFactors) {
    const { error: deleteErr } = await adminClient.auth.admin.mfa.deleteFactor({
      userId,
      id: f.id,
    });
    if (deleteErr) continue;
    await recordAudit({
      action: AUDIT.auth.mfa_disabled,
      subjectType: "user",
      subjectId: userId,
      actorUserId: userId,
      actorRole: "venue_owner",
      context: { factor_id: f.id, reason: "recovery_code_consumed" },
    });
  }

  const actor = await currentActor(userId);
  await recordAudit({
    action: AUDIT.user.mfa_recovery_code_consumed,
    subjectType: "user",
    subjectId: userId,
    actorUserId: actor.actorUserId,
    impersonatorUserId: actor.impersonatorUserId ?? undefined,
    actorRole: "venue_owner",
    context: {},
  });

  const remaining = await countUnconsumedRecoveryCodes(userId);
  return { ok: true, remaining };
}

// ─── changePassword + signOutEverywhere (§01 §5a.2/§5a.4 phase 2) ────────

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export interface ChangePasswordDeps {
  supabase: SupabaseClient;
  makeTransientClient: () => SupabaseClient;
}

/**
 * Change the signed-in user's password. Validates current password via a
 * transient anon-key client (no cookie binding — leaves user's session intact
 * for the duration of the check). Then calls updateUser to rotate JWT material
 * (§5a.4). Audits with currentActor threading. Caller must sign-out and
 * redirect after — updateUser invalidates the session implicitly on next
 * refresh, but the caller is responsible for the redirect-to-sign-in UX.
 *
 * Password policy enforcement is the caller's job (server action runs
 * validatePasswordPolicy from password-policy.ts before invoking this).
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  deps: ChangePasswordDeps,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, makeTransientClient } = deps;

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user?.email) {
    return { ok: false, error: "Not signed in." };
  }
  const email = userData.user.email;
  const userId = userData.user.id;

  const transient = makeTransientClient();
  const { error: signInError } = await transient.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (signInError) {
    return { ok: false, error: "Current password is incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) return { ok: false, error: updateError.message };

  const actor = await currentActor(userId);
  await recordAudit({
    action: AUDIT.auth.password_reset_completed,
    subjectType: "user",
    subjectId: userId,
    actorUserId: actor.actorUserId,
    impersonatorUserId: actor.impersonatorUserId ?? undefined,
    actorRole: "venue_owner",
    context: {},
  });

  // updateUser rotates JWT material; sign out the local session so the user
  // re-authenticates on next request.
  await supabase.auth.signOut();
  return { ok: true };
}

/**
 * Production helper for callers that don't want to construct a transient
 * client themselves. The transient client is anon-key + no-cookie-binding,
 * so signInWithPassword validates credentials without touching the user's
 * real session cookies.
 */
export function makeTransientAnonClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Sign out from every active session (all devices) via Supabase's
 * scope='global' signOut, invalidating all refresh tokens for the user.
 * Audits with currentActor threading.
 */
export async function signOutEverywhere(supabase: SupabaseClient): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (userId) {
    const actor = await currentActor(userId);
    await recordAudit({
      action: AUDIT.user.signed_out_everywhere,
      subjectType: "user",
      subjectId: userId,
      actorUserId: actor.actorUserId,
      impersonatorUserId: actor.impersonatorUserId ?? undefined,
      actorRole: "venue_owner",
      context: {},
    });
  }
  await supabase.auth.signOut({ scope: "global" });
}
