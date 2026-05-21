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
import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";
import { dbAdmin } from "@/lib/db/admin";
import {
  organizationMembers,
  restaurantStaff,
  restaurants,
} from "@/lib/db/schema";
import type { CurrentSession } from "@/lib/auth/session";

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
    return helperImpl(session);
  },
);
