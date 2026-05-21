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
 * MembershipResolver is the swap point. The active default is
 * `orgResolver` (§01 Wave 2: queries `organization_members` +
 * `restaurant_staff`). `legacyResolver` (current-prod
 * `restaurants.owner_user_id` → `venue_owner`) is kept as a rollback
 * fallback for one wave; deletable once orgResolver soaks.
 */

import "server-only";
import { cache } from "react";
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
  // call without pulling in db dependencies. §01 Wave 2: swapped from
  // legacyResolver (current-prod owner_user_id) to orgResolver (new
  // organization_members + restaurant_staff tables). legacyResolver is
  // kept as a fallback for one wave; deletable after orgResolver soaks.
  const { orgResolver } = await import("./resolvers/org");
  activeResolver = orgResolver;
  return activeResolver;
}

/**
 * Per-request membership cache per §01 §4.2 step 6. React's `cache()`
 * scopes the Map to a single React render (server component or server
 * action request); a fresh request gets a fresh Map. Outside a React
 * runtime (jest, scripts) `cache()` is a passthrough — each call
 * returns a fresh Map, so dedup doesn't kick in. That's why
 * `dedupRolesFor` is exported with an injectable Map for tests.
 *
 * We cache the Promise (not the resolved value) so concurrent can()
 * calls for the same scope dedupe in flight: only one DB query goes out.
 */
const getRequestMembershipCache = cache(
  (): Map<string, Promise<MatrixRole[]>> => new Map(),
);

function scopeKey(scope: MembershipScope): string {
  switch (scope.kind) {
    case "restaurant":
      return `r:${scope.id}`;
    case "venue":
      return `v:${scope.restaurantId}`;
    case "organization":
      return `o:${scope.id}`;
  }
}

/** Exported so tests can verify dedup with an injected Map. */
export async function dedupRolesFor(
  resolver: MembershipResolver,
  userId: string,
  scope: MembershipScope,
  map: Map<string, Promise<MatrixRole[]>>,
): Promise<MatrixRole[]> {
  const key = `${userId}|${scopeKey(scope)}`;
  let pending = map.get(key);
  if (!pending) {
    pending = resolver.rolesForScope(userId, scope);
    map.set(key, pending);
  }
  return pending;
}

async function rolesFor(
  resolver: MembershipResolver,
  userId: string,
  scope: MembershipScope,
): Promise<MatrixRole[]> {
  return dedupRolesFor(resolver, userId, scope, getRequestMembershipCache());
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
  const roles = await rolesFor(resolver, session.userId, scope);
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
