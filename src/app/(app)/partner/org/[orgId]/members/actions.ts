"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth/session";
import { staffInvitations } from "@/lib/identity/staff-invitation-service";

export interface InviteResult {
  ok: boolean;
  error?: string;
}

export async function inviteOrgMemberAction(
  _prev: InviteResult | undefined,
  formData: FormData,
): Promise<InviteResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "auth_required" };

  const organizationId = String(formData.get("organizationId") ?? "");
  const email = String(formData.get("email") ?? "");
  const role = String(formData.get("role") ?? "");

  const res = await staffInvitations.inviteOrgMember(session, { organizationId, email, role });
  revalidatePath(`/partner/org/${organizationId}/members`);
  return res.ok ? { ok: true } : { ok: false, error: res.code };
}

export async function revokeOrgInvitationAction(
  organizationId: string,
  invitationId: string,
): Promise<InviteResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "auth_required" };
  const res = await staffInvitations.revokeStaffInvitation(session, invitationId);
  revalidatePath(`/partner/org/${organizationId}/members`);
  return res.ok ? { ok: true } : { ok: false, error: res.code };
}

export async function resendOrgInvitationAction(
  organizationId: string,
  invitationId: string,
): Promise<InviteResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "auth_required" };
  const res = await staffInvitations.resendStaffInvitation(session, invitationId);
  revalidatePath(`/partner/org/${organizationId}/members`);
  return res.ok ? { ok: true } : { ok: false, error: res.code };
}
