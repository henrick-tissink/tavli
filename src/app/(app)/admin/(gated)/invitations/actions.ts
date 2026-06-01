"use server";

import { revalidatePath } from "next/cache";
import { render } from "@react-email/render";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  invitationUrl,
} from "@/lib/invitations";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
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

  const subject = `You're invited to Tavli${proposedName ? ` — ${proposedName}` : ""}`;
  const node = InvitationEmail({
    inviteUrl: url,
    cityName: city?.name,
    proposedName: proposedName || undefined,
    invitedByName: session.profile.fullName ?? undefined,
    expiresAt,
  });
  const html = await render(node);
  const text = await render(node, { plainText: true });
  // Platform-level invitation — no restaurant/org context. Wrapper falls back
  // to PLATFORM_ORG_ID for organization_id_at_event.
  const emailResult = await sendTransactionalEmail({
    to: email,
    locale: "ro",
    templateKey: "staff_invitation",
    subject,
    html,
    text,
    context: {},
  });

  revalidatePath("/admin/invitations");
  revalidatePath("/admin");

  return {
    ok: true,
    invitationUrl: url,
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
  const subject = `Your Tavli invitation (resent)`;
  const node = InvitationEmail({
    inviteUrl: url,
    cityName: city?.name,
    proposedName: invitation.proposed_name ?? undefined,
    invitedByName: session.profile.fullName ?? undefined,
    expiresAt,
  });
  const html = await render(node);
  const text = await render(node, { plainText: true });
  // Platform-level invitation — no restaurant/org context. Wrapper falls back
  // to PLATFORM_ORG_ID for organization_id_at_event.
  const emailResult = await sendTransactionalEmail({
    to: invitation.email,
    locale: "ro",
    templateKey: "staff_invitation",
    subject,
    html,
    text,
    context: {},
  });

  revalidatePath("/admin/invitations");

  return {
    ok: true,
    url,
    error: emailResult.ok ? undefined : emailResult.error,
  };
}
