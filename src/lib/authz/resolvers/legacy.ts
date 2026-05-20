/**
 * Legacy membership resolver: maps the current-prod data model
 * (`profiles.role` + `restaurants.owner_user_id`) into MatrixRole values.
 *
 * This is the substrate until §01 (Wave 2) ships the `organizations`
 * and `restaurant_staff` tables. At that point a new resolver replaces
 * this one and the call sites don't change.
 *
 * Mapping today:
 * - `profiles.role === 'admin'` is handled by can()'s early return,
 *   not by this resolver.
 * - `profiles.role === 'restaurant_owner'` + `restaurants.owner_user_id`
 *   match → `venue_owner` for that one restaurant.
 * - Everything else returns no roles.
 *
 * Because there's no `organizations` table yet, org-scoped roles
 * (org_owner, org_admin, org_manager) are NEVER granted by this
 * resolver — actions that require them deny for non-admins until §01.
 */

import "server-only";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { MatrixRole } from "../permissions";
import type { MembershipResolver, MembershipScope } from "../can";

export const legacyResolver: MembershipResolver = {
  async rolesForScope(userId, scope): Promise<MatrixRole[]> {
    if (scope.kind === "restaurant" || scope.kind === "venue") {
      const restaurantId = scope.kind === "restaurant"
        ? scope.id
        : scope.restaurantId;
      const rows = await dbAdmin
        .select({ ownerUserId: restaurants.ownerUserId })
        .from(restaurants)
        .where(
          and(
            eq(restaurants.id, restaurantId),
            eq(restaurants.ownerUserId, userId),
          ),
        )
        .limit(1);
      return rows.length > 0 ? ["venue_owner"] : [];
    }
    // No organizations/restaurant_staff tables yet — org-scoped roles
    // and staff_invitation scopes are unresolvable until §01.
    return [];
  },
} satisfies MembershipResolver;

export type { MembershipScope };
