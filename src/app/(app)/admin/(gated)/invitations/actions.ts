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
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";

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
  const m = getMessages(await resolveAppLocale(), "admin.invitations");
  const session = await getCurrentSession();
  if (!session || session.profile.role !== "admin") {
    return { ok: false, error: m.errors.unauthorised };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const cityId = String(formData.get("cityId") ?? "").trim();
  const proposedName = String(formData.get("proposedName") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { ok: false, error: m.errors.validEmailRequired };
  }
  if (!cityId) {
    return { ok: false, error: m.errors.cityRequired };
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

  // Email subject is outbound content (the recipient has no locale yet, and the
  // body is sent in a fixed locale), so resolve it against a fixed locale rather
  // than the admin operator's UI locale.
  const emailM = getMessages("en", "admin.invitations");
  const subject = proposedName
    ? interpolate(emailM.email.subjectNamed, { name: proposedName })
    : emailM.email.subject;
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
  const m = getMessages(await resolveAppLocale(), "admin.invitations");
  const session = await getCurrentSession();
  if (!session || session.profile.role !== "admin") {
    return { ok: false, error: m.errors.unauthorised };
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
    return { ok: false, error: error?.message ?? m.errors.notFound };
  }

  const { data: city } = await supabase
    .from("cities")
    .select("name")
    .eq("id", invitation.city_id)
    .maybeSingle();

  const url = invitationUrl(raw);
  // Outbound email subject — fixed locale, not the admin's UI locale (see createInvitation).
  const subject = getMessages("en", "admin.invitations").email.subjectResent;
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
