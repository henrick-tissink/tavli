"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  invitationUrl,
} from "@/lib/invitations";
import { sendEmail } from "@/lib/email/resend";
import { InvitationEmail } from "@/emails/InvitationEmail";

export interface CreateInvitationResult {
  ok: boolean;
  error?: string;
  invitationUrl?: string;
  devMode?: boolean;
}

export async function createInvitation(
  _prev: CreateInvitationResult | undefined,
  formData: FormData,
): Promise<CreateInvitationResult> {
  const session = await getCurrentSession();
  if (!session || session.profile.role !== "admin") {
    return { ok: false, error: "Unauthorised." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const cityId = String(formData.get("cityId") ?? "").trim();
  const proposedName = String(formData.get("proposedName") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { ok: false, error: "Valid email is required." };
  }
  if (!cityId) {
    return { ok: false, error: "City is required." };
  }

  const supabase = await createSupabaseServerClient();

  const { raw, hash } = generateInvitationToken();
  const expiresAt = invitationExpiresAt();

  const { error } = await supabase
    .from("invitations")
    .insert({
      email,
      token_hash: hash,
      city_id: cityId,
      proposed_name: proposedName || null,
      status: "pending",
      expires_at: expiresAt.toISOString(),
      invited_by_user_id: session.userId,
    });

  if (error) {
    return { ok: false, error: error.message };
  }

  const url = invitationUrl(raw);
  const { data: city } = await supabase
    .from("cities")
    .select("name")
    .eq("id", cityId)
    .maybeSingle();

  const emailResult = await sendEmail({
    to: email,
    subject: `You're invited to Tavli${proposedName ? ` — ${proposedName}` : ""}`,
    react: InvitationEmail({
      inviteUrl: url,
      cityName: city?.name,
      proposedName: proposedName || undefined,
      invitedByName: session.profile.fullName ?? undefined,
      expiresAt,
    }),
  });

  revalidatePath("/admin/invitations");
  revalidatePath("/admin");

  return {
    ok: true,
    invitationUrl: url,
    devMode: emailResult.devMode,
    error: emailResult.ok ? undefined : emailResult.error,
  };
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session || session.profile.role !== "admin") return;
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("status", "pending");
  revalidatePath("/admin/invitations");
}

export async function resendInvitation(
  invitationId: string,
): Promise<{ ok: boolean; error?: string; devMode?: boolean; url?: string }> {
  const session = await getCurrentSession();
  if (!session || session.profile.role !== "admin") {
    return { ok: false, error: "Unauthorised." };
  }
  const supabase = await createSupabaseServerClient();

  const { raw, hash } = generateInvitationToken();
  const expiresAt = invitationExpiresAt();

  const { data: invitation, error } = await supabase
    .from("invitations")
    .update({
      token_hash: hash,
      expires_at: expiresAt.toISOString(),
      status: "pending",
    })
    .eq("id", invitationId)
    .select("email, city_id, proposed_name")
    .maybeSingle();

  if (error || !invitation) {
    return { ok: false, error: error?.message ?? "Invitation not found." };
  }

  const { data: city } = await supabase
    .from("cities")
    .select("name")
    .eq("id", invitation.city_id)
    .maybeSingle();

  const url = invitationUrl(raw);
  const emailResult = await sendEmail({
    to: invitation.email,
    subject: `Your Tavli invitation (resent)`,
    react: InvitationEmail({
      inviteUrl: url,
      cityName: city?.name,
      proposedName: invitation.proposed_name ?? undefined,
      invitedByName: session.profile.fullName ?? undefined,
      expiresAt,
    }),
  });

  revalidatePath("/admin/invitations");

  return {
    ok: true,
    devMode: emailResult.devMode,
    url,
    error: emailResult.ok ? undefined : emailResult.error,
  };
}
