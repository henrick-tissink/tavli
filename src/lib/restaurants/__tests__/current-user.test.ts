/**
 * @jest-environment node
 *
 * Tests for `currentUserPrimaryRestaurant` via the DI seam. No database;
 * the production-bound `currentUserPrimaryRestaurant` export uses the
 * `makeCurrentUserPrimaryRestaurant(productionDeps)` factory whose deps
 * are stubbed here.
 */

import type { CurrentUserPrimaryRestaurantDeps } from "../current-user";
import { makeCurrentUserPrimaryRestaurant } from "../current-user";
import type { CurrentSession } from "@/lib/auth/session";

function mockSession(opts: {
  userId?: string;
  defaultOrganizationId?: string | null;
}): CurrentSession {
  return {
    userId: opts.userId ?? "u-1",
    userEmail: "test@example.com",
    profile: {
      id: opts.userId ?? "u-1",
      role: "restaurant_owner",
      fullName: null,
      email: "test@example.com",
      locale: "ro",
      defaultOrganizationId: opts.defaultOrganizationId ?? null,
    },
  };
}

describe("currentUserPrimaryRestaurant", () => {
  it("returns oldest restaurant in default_organization_id when set and the org has restaurants", async () => {
    const deps: CurrentUserPrimaryRestaurantDeps = {
      loadOldestRestaurantInOrg: jest.fn().mockResolvedValue("r-1"),
      loadStaffMemberships: jest.fn(),
      loadOrgMembershipRestaurants: jest.fn(),
    };
    const helper = makeCurrentUserPrimaryRestaurant(deps);

    const result = await helper(mockSession({ defaultOrganizationId: "o-1" }));

    expect(result).toBe("r-1");
    expect(deps.loadOldestRestaurantInOrg).toHaveBeenCalledWith("o-1");
    expect(deps.loadStaffMemberships).not.toHaveBeenCalled();
  });

  it("falls through when default_organization_id is set but the org has no restaurants", async () => {
    const deps: CurrentUserPrimaryRestaurantDeps = {
      loadOldestRestaurantInOrg: jest.fn().mockResolvedValue(null),
      loadStaffMemberships: jest.fn().mockResolvedValue([
        { restaurantId: "r-2", joinedAt: new Date("2026-01-01") },
      ]),
      loadOrgMembershipRestaurants: jest.fn().mockResolvedValue([]),
    };
    const helper = makeCurrentUserPrimaryRestaurant(deps);

    const result = await helper(mockSession({ defaultOrganizationId: "o-1" }));

    expect(result).toBe("r-2");
  });

  it("returns earliest-joined restaurant across staff + org membership when no default org", async () => {
    const deps: CurrentUserPrimaryRestaurantDeps = {
      loadOldestRestaurantInOrg: jest.fn(),
      loadStaffMemberships: jest.fn().mockResolvedValue([
        { restaurantId: "r-A", joinedAt: new Date("2026-02-01") },
      ]),
      loadOrgMembershipRestaurants: jest.fn().mockResolvedValue([
        { restaurantId: "r-B", joinedAt: new Date("2026-01-01") },
      ]),
    };
    const helper = makeCurrentUserPrimaryRestaurant(deps);

    const result = await helper(mockSession({ defaultOrganizationId: null }));

    expect(result).toBe("r-B");
    expect(deps.loadOldestRestaurantInOrg).not.toHaveBeenCalled();
  });

  it("returns org-membership restaurant for a pure org-admin with no restaurant_staff rows", async () => {
    const deps: CurrentUserPrimaryRestaurantDeps = {
      loadOldestRestaurantInOrg: jest.fn(),
      loadStaffMemberships: jest.fn().mockResolvedValue([]),
      loadOrgMembershipRestaurants: jest.fn().mockResolvedValue([
        { restaurantId: "r-C", joinedAt: new Date("2026-03-01") },
      ]),
    };
    const helper = makeCurrentUserPrimaryRestaurant(deps);

    const result = await helper(mockSession({ defaultOrganizationId: null }));

    expect(result).toBe("r-C");
  });

  it("returns null when the user has only soft-deleted memberships (deps already filter by is_active)", async () => {
    // Deps are expected to filter is_active = true before returning. This
    // test verifies that when deps return empty, the helper returns null.
    const deps: CurrentUserPrimaryRestaurantDeps = {
      loadOldestRestaurantInOrg: jest.fn().mockResolvedValue(null),
      loadStaffMemberships: jest.fn().mockResolvedValue([]),
      loadOrgMembershipRestaurants: jest.fn().mockResolvedValue([]),
    };
    const helper = makeCurrentUserPrimaryRestaurant(deps);

    const result = await helper(mockSession({ defaultOrganizationId: "o-1" }));

    expect(result).toBeNull();
  });

  it("returns null when the user has no access at all", async () => {
    const deps: CurrentUserPrimaryRestaurantDeps = {
      loadOldestRestaurantInOrg: jest.fn(),
      loadStaffMemberships: jest.fn().mockResolvedValue([]),
      loadOrgMembershipRestaurants: jest.fn().mockResolvedValue([]),
    };
    const helper = makeCurrentUserPrimaryRestaurant(deps);

    const result = await helper(mockSession({ defaultOrganizationId: null }));

    expect(result).toBeNull();
  });
});
