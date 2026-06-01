"use server";

import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { staffInvitations } from "@/lib/identity/staff-invitation-service";

export interface AcceptStaffResult {
  ok: boolean;
  error?: string;
}

/**
 * Claim a staff invitation. The raw token is the bearer authorization, but the
 * signed-in user's email must match the invitation (enforced in the lib). On
 * success we redirect into the scope the invitee just joined.
 */
export async function acceptStaffInvitationAction(token: string): Promise<AcceptStaffResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "auth_required" };

  const userEmail = session.userEmail ?? session.profile.email ?? "";

  let res: Awaited<ReturnType<typeof staffInvitations.acceptStaffInvitation>>;
  try {
    res = await staffInvitations.acceptStaffInvitation({
      token,
      userId: session.userId,
      userEmail,
    });
  } catch {
    // Most likely a primary-key conflict — the user is already a member/staffer.
    return { ok: false, error: "already_member" };
  }

  if (!res.ok) return { ok: false, error: res.code };

  if (res.data.kind === "org" && res.data.organizationId) {
    redirect(`/partner/org/${res.data.organizationId}/members`);
  }
  redirect("/partner");
}
