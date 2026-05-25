import "server-only";

/**
 * §01 §6 — staff invitation flow (org-level + venue-level), on the shared
 * `staff_invitations` substrate (migration 0018). The table + RLS shipped in
 * Wave 2; this is the action surface deferred as build-order §13 step 10.
 *
 * Invite → emails a raw token (only its sha256 is stored). Claim looks up by
 * hash, verifies pending + not-expired + email-match, then inserts the
 * membership row (organization_members for kind='org', restaurant_staff for
 * kind='restaurant') and marks the invitation claimed — atomically.
 *
 * Factory-only export (DI for db / can / recordAudit / email / clock / token)
 * so the flow is unit-testable without Supabase or Resend.
 */
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  staffInvitations,
  organizationMembers,
  restaurantStaff,
  restaurants,
  profiles,
} from "@/lib/db/schema";
import { can as defaultCan } from "@/lib/authz/can";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "@/lib/invitations";
import type { CurrentSession } from "@/lib/auth/session";
import { ok, fail, forbidden, type ActionResult } from "@/lib/server-action";

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const ORG_ROLES = ["owner", "admin", "manager"] as const;
const VENUE_ROLES = ["owner", "manager", "host"] as const;
type OrgRole = (typeof ORG_ROLES)[number];
type VenueRole = (typeof VENUE_ROLES)[number];

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface StaffInvitationEmailInput {
  to: string;
  token: string;
  kind: "org" | "restaurant";
  role: string;
}

export interface StaffInvitationsDeps {
  db: typeof dbAdmin;
  can: typeof defaultCan;
  recordAudit: typeof defaultRecordAudit;
  sendEmail: (input: StaffInvitationEmailInput) => Promise<unknown>;
  now?: () => Date;
  genToken?: () => { raw: string; hash: string };
}

export function makeStaffInvitations(deps: StaffInvitationsDeps) {
  const now = deps.now ?? (() => new Date());
  const genToken = deps.genToken ?? generateInvitationToken;

  async function inviteOrgMember(
    session: CurrentSession,
    input: { organizationId: string; email: string; role: string },
  ): Promise<ActionResult<{ invitationId: string; token: string }>> {
    if (!(await deps.can(session, "staff.invite.org", { kind: "organization", id: input.organizationId }))) {
      return forbidden();
    }
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RX.test(email)) return fail("invalid_input", "Invalid email.");
    if (!ORG_ROLES.includes(input.role as OrgRole)) return fail("invalid_input", "Invalid org role.");

    const { raw, hash } = genToken();
    const [row] = await deps.db
      .insert(staffInvitations)
      .values({
        kind: "org",
        organizationId: input.organizationId,
        email,
        role: input.role,
        tokenHash: hash,
        expiresAt: new Date(now().getTime() + INVITE_TTL_MS),
        invitedByUserId: session.userId,
      })
      .returning({ id: staffInvitations.id });

    await deps.recordAudit({
      action: AUDIT.organization.member_invited,
      subjectType: "staff_invitation",
      subjectId: row.id,
      actorUserId: session.userId,
      actorRole: "org_owner",
      organizationId: input.organizationId,
      context: { email, role: input.role },
    });
    await deps.sendEmail({ to: email, token: raw, kind: "org", role: input.role });
    return ok({ invitationId: row.id, token: raw });
  }

  async function inviteVenueStaff(
    session: CurrentSession,
    input: { restaurantId: string; organizationId: string; email: string; role: string },
  ): Promise<ActionResult<{ invitationId: string; token: string }>> {
    if (!(await deps.can(session, "staff.invite.venue", { kind: "restaurant", id: input.restaurantId, organization_id: input.organizationId }))) {
      return forbidden();
    }
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RX.test(email)) return fail("invalid_input", "Invalid email.");
    if (!VENUE_ROLES.includes(input.role as VenueRole)) return fail("invalid_input", "Invalid venue role.");

    const { raw, hash } = genToken();
    const [row] = await deps.db
      .insert(staffInvitations)
      .values({
        kind: "restaurant",
        restaurantId: input.restaurantId,
        email,
        role: input.role,
        tokenHash: hash,
        expiresAt: new Date(now().getTime() + INVITE_TTL_MS),
        invitedByUserId: session.userId,
      })
      .returning({ id: staffInvitations.id });

    await deps.recordAudit({
      action: AUDIT.restaurant.staff_invited,
      subjectType: "staff_invitation",
      subjectId: row.id,
      actorUserId: session.userId,
      actorRole: "venue_owner",
      restaurantId: input.restaurantId,
      context: { email, role: input.role },
    });
    await deps.sendEmail({ to: email, token: raw, kind: "restaurant", role: input.role });
    return ok({ invitationId: row.id, token: raw });
  }

  async function loadByToken(token: string) {
    const rows = await deps.db
      .select()
      .from(staffInvitations)
      .where(eq(staffInvitations.tokenHash, hashInvitationToken(token)))
      .limit(1);
    return rows[0] as
      | {
          id: string;
          kind: "org" | "restaurant";
          organizationId: string | null;
          restaurantId: string | null;
          email: string;
          role: string;
          status: string;
          expiresAt: Date;
          invitedByUserId: string;
        }
      | undefined;
  }

  // The token is the authorization (no session). Verifies pending + not-expired
  // + the claimant's email matches the invitation.
  async function acceptStaffInvitation(input: {
    token: string;
    userId: string;
    userEmail: string;
  }): Promise<ActionResult<{ kind: "org" | "restaurant"; organizationId: string | null; restaurantId: string | null }>> {
    const inv = await loadByToken(input.token);
    if (!inv || inv.status !== "pending") return fail("not_found", "Invitation not found.");
    if (inv.expiresAt.getTime() <= now().getTime()) return fail("invalid_input", "Invitation expired.");
    if (inv.email.trim().toLowerCase() !== input.userEmail.trim().toLowerCase()) return forbidden();

    await deps.db.transaction(async (tx) => {
      if (inv.kind === "org") {
        await tx.insert(organizationMembers).values({
          organizationId: inv.organizationId!,
          userId: input.userId,
          role: inv.role as OrgRole,
          invitedByUserId: inv.invitedByUserId,
        });
      } else {
        await tx.insert(restaurantStaff).values({
          restaurantId: inv.restaurantId!,
          userId: input.userId,
          role: inv.role as VenueRole,
          invitedByUserId: inv.invitedByUserId,
        });
      }
      await tx
        .update(staffInvitations)
        .set({ status: "claimed", claimedAt: new Date(), claimedByUserId: input.userId, updatedAt: new Date() })
        .where(eq(staffInvitations.id, inv.id));

      // C4: bump the coarse profile role hint so the partner gate (which
      // requires role === "restaurant_owner") admits the new member. Only
      // promote a "consumer" — never downgrade a tavli_admin or touch an
      // existing partner. Fine-grained authority still comes from can() over
      // the membership tables, not this hint.
      await tx
        .update(profiles)
        .set({ role: "restaurant_owner" })
        .where(and(eq(profiles.id, input.userId), eq(profiles.role, "consumer")));
    });

    await deps.recordAudit({
      action: inv.kind === "org" ? AUDIT.organization.member_joined : AUDIT.restaurant.staff_added,
      subjectType: inv.kind === "org" ? "organization_member" : "restaurant_staff",
      subjectId: input.userId,
      actorUserId: input.userId,
      actorRole: inv.kind === "org" ? "org_owner" : "venue_owner",
      organizationId: inv.organizationId ?? undefined,
      restaurantId: inv.restaurantId ?? undefined,
      context: { invitation_id: inv.id, role: inv.role },
    });
    return ok({ kind: inv.kind, organizationId: inv.organizationId, restaurantId: inv.restaurantId });
  }

  // Authorize a lifecycle action (revoke/resend) against the invitation's scope,
  // re-using the same permission the create path required.
  async function authorizeForInvite(session: CurrentSession, inv: NonNullable<Awaited<ReturnType<typeof loadByToken>>>) {
    if (inv.kind === "org") {
      return deps.can(session, "staff.invite.org", { kind: "organization", id: inv.organizationId! });
    }
    // venue: resolve the parent org for the can() subject.
    const r = await deps.db
      .select({ organizationId: restaurants.organizationId })
      .from(restaurants)
      .where(eq(restaurants.id, inv.restaurantId!))
      .limit(1);
    const orgId = (r[0] as { organizationId: string } | undefined)?.organizationId ?? "";
    return deps.can(session, "staff.invite.venue", { kind: "restaurant", id: inv.restaurantId!, organization_id: orgId });
  }

  async function loadById(invitationId: string) {
    const rows = await deps.db
      .select()
      .from(staffInvitations)
      .where(eq(staffInvitations.id, invitationId))
      .limit(1);
    return rows[0] as Awaited<ReturnType<typeof loadByToken>>;
  }

  async function revokeStaffInvitation(session: CurrentSession, invitationId: string): Promise<ActionResult<void>> {
    const inv = await loadById(invitationId);
    if (!inv) return fail("not_found", "Invitation not found.");
    if (!(await authorizeForInvite(session, inv))) return forbidden();
    await deps.db
      .update(staffInvitations)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(and(eq(staffInvitations.id, invitationId), eq(staffInvitations.status, "pending")));
    await deps.recordAudit({
      action: inv.kind === "org" ? AUDIT.organization.member_removed : AUDIT.restaurant.staff_removed,
      subjectType: "staff_invitation",
      subjectId: invitationId,
      actorUserId: session.userId,
      actorRole: inv.kind === "org" ? "org_owner" : "venue_owner",
      organizationId: inv.organizationId ?? undefined,
      restaurantId: inv.restaurantId ?? undefined,
      context: { revoked: true },
    });
    return ok(undefined);
  }

  async function resendStaffInvitation(session: CurrentSession, invitationId: string): Promise<ActionResult<{ token: string }>> {
    const inv = await loadById(invitationId);
    if (!inv) return fail("not_found", "Invitation not found.");
    if (!(await authorizeForInvite(session, inv))) return forbidden();
    if (inv.status !== "pending" || inv.expiresAt.getTime() <= now().getTime()) {
      return fail("invalid_input", "Only a pending, unexpired invitation can be resent.");
    }
    const { raw, hash } = genToken();
    await deps.db
      .update(staffInvitations)
      .set({ tokenHash: hash, expiresAt: new Date(now().getTime() + INVITE_TTL_MS), updatedAt: new Date() })
      .where(eq(staffInvitations.id, invitationId));
    await deps.sendEmail({ to: inv.email, token: raw, kind: inv.kind, role: inv.role });
    return ok({ token: raw });
  }

  return { inviteOrgMember, inviteVenueStaff, acceptStaffInvitation, revokeStaffInvitation, resendStaffInvitation };
}
