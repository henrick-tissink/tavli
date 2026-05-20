/**
 * can() / requireCan() — central authorisation per foundations §3.4 +
 * §01 §4. Server actions delegate every access check here; no domain
 * code rolls its own authz.
 *
 * Resolution order (matches §01 §4.2):
 *   1. tavli_admin shortcut: profile.role === 'admin' → true.
 *   2. Resolve the subject to a "scope" the resolver understands
 *      (restaurant, venue, organization).
 *   3. Resolver returns the MatrixRoles the user holds for that scope.
 *   4. ANY granted role with a `true` cell in the matrix → allow.
 *      Union semantics: holding multiple roles never DENIES; it can
 *      only ADD permissions.
 *   5. Otherwise → deny.
 *
 * MembershipResolver is the swap point. The default is `legacyResolver`
 * (current-prod data model: `restaurants.owner_user_id` → `venue_owner`).
 * §01 (Wave 2) ships an org-aware resolver that queries the new
 * `organization_members` + `restaurant_staff` tables. Call sites don't
 * change when we swap.
 */

import "server-only";
import { fail, type ActionResult } from "@/lib/server-action";
import type { CurrentSession } from "@/lib/auth/session";
import {
  PERMISSION_MATRIX,
  type Action,
  type MatrixRole,
  type Subject,
} from "./permissions";

export type MembershipScope =
  | { kind: "restaurant"; id: string; organizationId?: string }
  | { kind: "venue"; restaurantId: string }
  | { kind: "organization"; id: string };

export interface MembershipResolver {
  rolesForScope(userId: string, scope: MembershipScope): Promise<MatrixRole[]>;
}

let activeResolver: MembershipResolver | null = null;

/**
 * Install the resolver. Called once at module load time by the relevant
 * compositional layer. Tests inject a stub; prod uses legacyResolver
 * today, the §01 org-aware resolver after Wave 2.
 */
export function setMembershipResolver(resolver: MembershipResolver): void {
  activeResolver = resolver;
}

async function getActiveResolver(): Promise<MembershipResolver> {
  if (activeResolver) return activeResolver;
  // Lazy default — keeps tests free to install a stub before any can()
  // call without pulling in db dependencies.
  const { legacyResolver } = await import("./resolvers/legacy");
  activeResolver = legacyResolver;
  return activeResolver;
}

function scopeForSubject(subject: Subject): MembershipScope | null {
  switch (subject.kind) {
    case "restaurant":
      return { kind: "restaurant", id: subject.id, organizationId: subject.organization_id };
    case "organization":
      return { kind: "organization", id: subject.id };
    case "reservation":
    case "campaign":
      return { kind: "venue", restaurantId: subject.restaurant_id };
    case "staff_invitation":
      // staff invitations can be scoped to either org or venue. Prefer
      // the org scope when present (org-level invite); fall back to
      // venue otherwise.
      if (subject.organization_id) {
        return { kind: "organization", id: subject.organization_id };
      }
      if (subject.restaurant_id) {
        return { kind: "venue", restaurantId: subject.restaurant_id };
      }
      return null;
    case "global":
      return null; // global actions only ever pass via the admin shortcut
  }
}

export async function can(
  session: CurrentSession,
  action: Action,
  subject: Subject,
): Promise<boolean> {
  // §4.2 step 1 — Tavli admin shortcut.
  if (session.profile.role === "admin") return true;

  const scope = scopeForSubject(subject);
  if (!scope) return false; // global/unscoped — only admins allowed

  const resolver = await getActiveResolver();
  const roles = await resolver.rolesForScope(session.userId, scope);
  if (roles.length === 0) return false;

  const cells = PERMISSION_MATRIX[action];
  return roles.some((role) => cells[role]);
}

/**
 * Same predicate as can(), but returns a ready-made `forbidden()`
 * ActionResult on deny so callers can early-return cleanly:
 *
 *   const denied = await requireCan(session, 'reservation.modify', subj)
 *   if (denied) return denied
 */
export async function requireCan(
  session: CurrentSession,
  action: Action,
  subject: Subject,
): Promise<ActionResult<never> | null> {
  if (await can(session, action, subject)) return null;
  return fail("forbidden");
}
