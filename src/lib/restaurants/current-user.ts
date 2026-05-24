/**
 * currentUserPrimaryRestaurant — resolves the restaurant id of the user's
 * "active" venue, or null if they have no access.
 *
 * Resolution order:
 *   1. If profile.defaultOrganizationId is set, try the oldest restaurant
 *      in that org. Fall through if the org has no restaurants.
 *   2. Union of restaurant_staff (any role) + restaurants in any org the
 *      user is an active member of. Return earliest by joined_at.
 *   3. Return null.
 *
 * Wrapped in React's cache() for per-request memoization, mirroring the
 * pattern in src/lib/authz/can.ts.
 */

import "server-only";
import { and, asc, eq, or, isNotNull } from "drizzle-orm";
import { cache } from "react";
import { dbAdmin } from "@/lib/db/admin";
import {
  organizationMembers,
  restaurantStaff,
  restaurants,
} from "@/lib/db/schema";
import type { CurrentSession } from "@/lib/auth/session";

/** The cookie holding the user's explicitly-chosen active venue (§09 §6.2). */
export const ACTIVE_VENUE_COOKIE = "tavli_active_venue";

/** True if the user is active venue-staff OR an active member of the venue's org. */
export async function userHasVenueAccess(userId: string, restaurantId: string): Promise<boolean> {
  const staff = await dbAdmin
    .select({ x: restaurantStaff.userId })
    .from(restaurantStaff)
    .where(
      and(
        eq(restaurantStaff.userId, userId),
        eq(restaurantStaff.restaurantId, restaurantId),
        eq(restaurantStaff.isActive, true),
      ),
    )
    .limit(1);
  if (staff.length > 0) return true;
  const org = await dbAdmin
    .select({ x: restaurants.id })
    .from(restaurants)
    .innerJoin(
      organizationMembers,
      eq(organizationMembers.organizationId, restaurants.organizationId),
    )
    .where(
      and(
        eq(restaurants.id, restaurantId),
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.isActive, true),
      ),
    )
    .limit(1);
  return org.length > 0;
}

/** All venues the user can manage (staff or org member), deduped, by name. */
export async function listAccessibleVenues(
  session: CurrentSession,
): Promise<{ id: string; name: string }[]> {
  const userId = session.userId;
  const rows = await dbAdmin
    .selectDistinct({ id: restaurants.id, name: restaurants.name })
    .from(restaurants)
    .leftJoin(
      restaurantStaff,
      and(
        eq(restaurantStaff.restaurantId, restaurants.id),
        eq(restaurantStaff.userId, userId),
        eq(restaurantStaff.isActive, true),
      ),
    )
    .leftJoin(
      organizationMembers,
      and(
        eq(organizationMembers.organizationId, restaurants.organizationId),
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.isActive, true),
      ),
    )
    .where(or(isNotNull(restaurantStaff.userId), isNotNull(organizationMembers.userId)));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export interface CurrentUserPrimaryRestaurantDeps {
  loadOldestRestaurantInOrg(organizationId: string): Promise<string | null>;
  loadStaffMemberships(
    userId: string,
  ): Promise<{ restaurantId: string; joinedAt: Date }[]>;
  loadOrgMembershipRestaurants(
    userId: string,
  ): Promise<{ restaurantId: string; joinedAt: Date }[]>;
}

export function makeCurrentUserPrimaryRestaurant(
  deps: CurrentUserPrimaryRestaurantDeps,
): (session: CurrentSession) => Promise<string | null> {
  return async function currentUserPrimaryRestaurant(session) {
    const userId = session.userId;
    const defaultOrgId = session.profile.defaultOrganizationId;

    if (defaultOrgId) {
      const id = await deps.loadOldestRestaurantInOrg(defaultOrgId);
      if (id) return id;
      // fall through: org has no restaurants
    }

    const [staffRows, orgRows] = await Promise.all([
      deps.loadStaffMemberships(userId),
      deps.loadOrgMembershipRestaurants(userId),
    ]);

    const all = [...staffRows, ...orgRows];
    if (all.length === 0) return null;
    all.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
    return all[0].restaurantId;
  };
}

const productionDeps: CurrentUserPrimaryRestaurantDeps = {
  async loadOldestRestaurantInOrg(organizationId) {
    const rows = await dbAdmin
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.organizationId, organizationId))
      .orderBy(asc(restaurants.createdAt))
      .limit(1);
    return rows[0]?.id ?? null;
  },

  async loadStaffMemberships(userId) {
    const rows = await dbAdmin
      .select({
        restaurantId: restaurantStaff.restaurantId,
        joinedAt: restaurantStaff.joinedAt,
      })
      .from(restaurantStaff)
      .where(
        and(
          eq(restaurantStaff.userId, userId),
          eq(restaurantStaff.isActive, true),
        ),
      );
    return rows.map((r) => ({ restaurantId: r.restaurantId, joinedAt: r.joinedAt }));
  },

  async loadOrgMembershipRestaurants(userId) {
    const rows = await dbAdmin
      .select({
        restaurantId: restaurants.id,
        joinedAt: organizationMembers.joinedAt,
      })
      .from(organizationMembers)
      .innerJoin(
        restaurants,
        eq(restaurants.organizationId, organizationMembers.organizationId),
      )
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.isActive, true),
        ),
      );
    return rows.map((r) => ({ restaurantId: r.restaurantId, joinedAt: r.joinedAt }));
  },
};

const helperImpl = makeCurrentUserPrimaryRestaurant(productionDeps);

/**
 * Per-request memoization via React's cache(). Multiple callers in one
 * render dedupe; outside a React rendering context (jest, scripts) each
 * call gets a fresh execution — that's correct because tests and scripts
 * want determinism per call.
 */
export const currentUserPrimaryRestaurant = cache(
  async (session: CurrentSession): Promise<string | null> => {
    // Honour an explicit active-venue cookie when the user still has access.
    // Wrapped in try/catch: cookies() throws outside a request scope (jest,
    // scripts), where we simply fall back to the default resolution.
    try {
      const { cookies } = await import("next/headers");
      const pinned = (await cookies()).get(ACTIVE_VENUE_COOKIE)?.value;
      if (pinned && (await userHasVenueAccess(session.userId, pinned))) {
        return pinned;
      }
    } catch {
      /* not in a request scope — use default resolution */
    }
    return helperImpl(session);
  },
);
