// src/lib/authz/resolvers/org.ts
/**
 * OrgResolver — §01 Wave 2 replacement for `legacyResolver`. Returns the
 * MatrixRole(s) a user holds for a given scope.
 *
 * Venue scope: unions venue-staff roles (from `restaurant_staff`) with the
 * user's org-level roles for the venue's parent org (resolved via
 * `restaurants.organization_id` → `organization_members`).
 *
 * Organization scope: checks `organization_members` directly.
 *
 * Restaurant scope: same as venue scope.
 */

import "server-only";
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { organizationMembers, restaurantStaff, restaurants } from "@/lib/db/schema";
import type { MatrixRole } from "../permissions";
import type { MembershipResolver, MembershipScope } from "../can";

type OrgRole = "owner" | "admin" | "manager";
type VenueStaffRole = "owner" | "manager" | "host";

export interface OrgResolverDeps {
  loadVenueStaff(userId: string, restaurantId: string): Promise<{ role: VenueStaffRole }[]>;
  loadOrgMembership(userId: string, organizationId: string): Promise<{ role: OrgRole }[]>;
  loadRestaurantOrgId(restaurantId: string): Promise<string | null>;
}

const venueRoleToMatrix: Record<VenueStaffRole, MatrixRole> = {
  owner: "venue_owner",
  manager: "venue_manager",
  host: "venue_host",
};

const orgRoleToMatrix: Record<OrgRole, MatrixRole> = {
  owner: "org_owner",
  admin: "org_admin",
  manager: "org_manager",
};

export function makeOrgResolver(deps: OrgResolverDeps): MembershipResolver {
  return {
    async rolesForScope(userId, scope: MembershipScope): Promise<MatrixRole[]> {
      const roles: MatrixRole[] = [];

      if (scope.kind === "venue" || scope.kind === "restaurant") {
        const restaurantId = scope.kind === "venue" ? scope.restaurantId : scope.id;
        const venueRows = await deps.loadVenueStaff(userId, restaurantId);
        for (const row of venueRows) roles.push(venueRoleToMatrix[row.role]);

        // Cross-scope grant: if this venue has a parent org, fold in the
        // user's org-level roles for that org. Sequential rather than
        // parallel — clarity outweighs marginal latency at current scale,
        // and React's cache() dedupes per-request anyway. Convert to
        // Promise.all([loadVenueStaff, loadRestaurantOrgId]) only when
        // can() becomes a hot path.
        const orgId = await deps.loadRestaurantOrgId(restaurantId);
        if (orgId) {
          const orgRows = await deps.loadOrgMembership(userId, orgId);
          for (const row of orgRows) roles.push(orgRoleToMatrix[row.role]);
        }
      }

      if (scope.kind === "organization") {
        const orgRows = await deps.loadOrgMembership(userId, scope.id);
        for (const row of orgRows) roles.push(orgRoleToMatrix[row.role]);
      }

      return roles;
    },
  };
}

// Production resolver wired against the dbAdmin client. The DI seam
// (OrgResolverDeps) is what tests use to inject mocks; prod wires the
// real Drizzle queries below.
const productionDeps: OrgResolverDeps = {
  async loadVenueStaff(userId, restaurantId) {
    const rows = await dbAdmin
      .select({ role: restaurantStaff.role })
      .from(restaurantStaff)
      .where(
        and(
          eq(restaurantStaff.userId, userId),
          eq(restaurantStaff.restaurantId, restaurantId),
          eq(restaurantStaff.isActive, true),
        ),
      );
    return rows as { role: VenueStaffRole }[];
  },

  async loadOrgMembership(userId, organizationId) {
    const rows = await dbAdmin
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.isActive, true),
        ),
      );
    return rows as { role: OrgRole }[];
  },

  async loadRestaurantOrgId(restaurantId) {
    const rows = await dbAdmin
      .select({ organizationId: restaurants.organizationId })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);
    return rows[0]?.organizationId ?? null;
  },
};

export const orgResolver = makeOrgResolver(productionDeps);
