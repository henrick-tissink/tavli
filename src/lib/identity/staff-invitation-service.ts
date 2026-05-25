import "server-only";

/**
 * §01 §6 — production wiring for the staff-invitation flow. Binds the
 * DI'd `makeStaffInvitations` factory to the real db / authz / audit and a
 * Resend-backed sender that renders {@link StaffInvitationEmail}. Imported by
 * the thin `"use server"` wrappers in the partner routes.
 */
import { render } from "@react-email/render";
import { dbAdmin } from "@/lib/db/admin";
import { can } from "@/lib/authz/can";
import { recordAudit } from "@/lib/audit/record";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { appOrigin } from "@/lib/app-origin";
import { invitationExpiresAt } from "@/lib/invitations";
import { StaffInvitationEmail, getSubject } from "@/emails/StaffInvitationEmail";
import {
  makeStaffInvitations,
  type StaffInvitationEmailInput,
} from "./staff-invitations";

/** The page where an invitee accepts after signing in with the invited email. */
export function staffInvitationUrl(rawToken: string): string {
  return `${appOrigin()}/invitations/${rawToken}/accept-staff`;
}

async function sendStaffInvitationEmail(input: StaffInvitationEmailInput) {
  const node = StaffInvitationEmail({
    inviteUrl: staffInvitationUrl(input.token),
    kind: input.kind,
    role: input.role,
    // Display-only; mirrors the lib's 14-day INVITE_TTL.
    expiresAt: invitationExpiresAt(),
    locale: "ro",
  });
  const html = await render(node);
  const text = await render(node, { plainText: true });
  await sendTransactionalEmail({
    to: input.to,
    locale: "ro",
    templateKey: "staff_invitation",
    subject: getSubject("ro", { kind: input.kind }),
    html,
    text,
    context: {},
  });
}

export const staffInvitations = makeStaffInvitations({
  db: dbAdmin,
  can,
  recordAudit,
  sendEmail: sendStaffInvitationEmail,
});
