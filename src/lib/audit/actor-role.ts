/**
 * getActorRole — returns the user's highest-priority effective role for a
 * given restaurant. Used by recordAudit() callers to stamp an accurate
 * ActorRole on each audit row.
 *
 * Priority order:
 *   tavli_admin (profile.role === 'admin')
 *   > org_owner > org_admin > org_manager
 *   > venue_owner > venue_manager > venue_host
 *   > diner (authenticated but no staff role)
 *   > diner (no session — caller signals anon by passing null)
 */

import "server-only";
import { and, eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  organizationMembers,
  restaurantStaff,
  restaurants,
} from "@/lib/db/schema";
import type { CurrentSession } from "@/lib/auth/session";
import type { ActorRole } from "./actions";

type OrgRole = "owner" | "admin" | "manager";
type VenueStaffRole = "owner" | "manager" | "host";

export interface GetActorRoleDeps {
  loadVenueStaff(
    userId: string,
    restaurantId: string,
  ): Promise<{ role: VenueStaffRole }[]>;
  loadOrgMembershipForRestaurant(
    userId: string,
    restaurantId: string,
  ): Promise<{ role: OrgRole }[]>;
}

const orgRolePriority: Record<OrgRole, ActorRole> = {
  owner: "org_owner",
  admin: "org_admin",
  manager: "org_manager",
};

const venueRolePriority: Record<VenueStaffRole, ActorRole> = {
  owner: "venue_owner",
  manager: "venue_manager",
  host: "venue_host",
};

// Highest-priority-first; first match wins.
const ROLE_PRIORITY: ActorRole[] = [
  "tavli_admin",
  "org_owner",
  "org_admin",
  "org_manager",
  "venue_owner",
  "venue_manager",
  "venue_host",
  "diner",
];

export function makeGetActorRole(
  deps: GetActorRoleDeps,
): (session: CurrentSession | null, restaurantId: string) => Promise<ActorRole> {
  return async function getActorRole(session, restaurantId) {
    if (!session) return "diner";
    if (session.profile.role === "admin") return "tavli_admin";

    const [staffRows, orgRows] = await Promise.all([
      deps.loadVenueStaff(session.userId, restaurantId),
      deps.loadOrgMembershipForRestaurant(session.userId, restaurantId),
    ]);

    const candidates = new Set<ActorRole>();
    for (const r of orgRows) candidates.add(orgRolePriority[r.role]);
    for (const r of staffRows) candidates.add(venueRolePriority[r.role]);
    if (candidates.size === 0) return "diner";

    for (const role of ROLE_PRIORITY) {
      if (candidates.has(role)) return role;
    }
    return "diner"; // unreachable given the loop, but typed-exhaustive
  };
}

const productionDeps: GetActorRoleDeps = {
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

  async loadOrgMembershipForRestaurant(userId, restaurantId) {
    const rows = await dbAdmin
      .select({ role: organizationMembers.role })
      .from(organizationMembers)
      .innerJoin(
        restaurants,
        eq(restaurants.organizationId, organizationMembers.organizationId),
      )
      .where(
        and(
          eq(restaurants.id, restaurantId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.isActive, true),
        ),
      );
    return rows as { role: OrgRole }[];
  },
};

export const getActorRole = makeGetActorRole(productionDeps);
