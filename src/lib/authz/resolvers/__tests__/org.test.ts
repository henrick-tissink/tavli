// src/lib/authz/resolvers/__tests__/org.test.ts
import type { OrgResolverDeps } from "../org";
import { makeOrgResolver } from "../org";

const userId = "u-1";

describe("OrgResolver", () => {
  describe("venue scope", () => {
    it("returns venue_owner when the user has an active owner row in restaurant_staff", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([{ role: "owner" }]),
        loadOrgMembership: jest.fn(),
        loadRestaurantOrgId: jest.fn().mockResolvedValue(null),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "venue",
        restaurantId: "r-1",
      });

      expect(roles).toEqual(["venue_owner"]);
      expect(deps.loadVenueStaff).toHaveBeenCalledWith(userId, "r-1");
    });
  });

  describe("venue scope (multiple roles)", () => {
    it("unions multiple roles when the user has multiple staff rows", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([
          { role: "manager" },
          { role: "host" },
        ]),
        loadOrgMembership: jest.fn(),
        loadRestaurantOrgId: jest.fn().mockResolvedValue(null),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "venue",
        restaurantId: "r-1",
      });

      expect(roles).toEqual(["venue_manager", "venue_host"]);
    });

    it("returns an empty array when no rows exist", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([]),
        loadOrgMembership: jest.fn(),
        loadRestaurantOrgId: jest.fn().mockResolvedValue(null),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "venue",
        restaurantId: "r-1",
      });

      expect(roles).toEqual([]);
    });
  });

  describe("restaurant scope", () => {
    it("treats restaurant-kind scope identically to venue scope", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([{ role: "host" }]),
        loadOrgMembership: jest.fn(),
        loadRestaurantOrgId: jest.fn().mockResolvedValue(null),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "restaurant",
        id: "r-1",
      });

      expect(roles).toEqual(["venue_host"]);
      expect(deps.loadVenueStaff).toHaveBeenCalledWith(userId, "r-1");
    });
  });

  describe("organization scope", () => {
    it("maps org_owner / org_admin / org_manager DB roles to MatrixRoles", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn(),
        loadOrgMembership: jest.fn().mockResolvedValue([{ role: "admin" }]),
        loadRestaurantOrgId: jest.fn().mockResolvedValue(null),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "organization",
        id: "o-1",
      });

      expect(roles).toEqual(["org_admin"]);
      expect(deps.loadOrgMembership).toHaveBeenCalledWith(userId, "o-1");
    });

    it("returns empty when the user is not a member", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn(),
        loadOrgMembership: jest.fn().mockResolvedValue([]),
        loadRestaurantOrgId: jest.fn().mockResolvedValue(null),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "organization",
        id: "o-1",
      });

      expect(roles).toEqual([]);
    });
  });

  describe("venue scope — cross-scope grant via org membership", () => {
    it("grants org_admin to a non-venue-staff user when the restaurant belongs to an org they admin", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([]),
        loadOrgMembership: jest.fn().mockResolvedValue([{ role: "admin" }]),
        loadRestaurantOrgId: jest.fn().mockResolvedValue("o-1"),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "venue",
        restaurantId: "r-1",
      });

      expect(roles).toEqual(["org_admin"]);
      expect(deps.loadRestaurantOrgId).toHaveBeenCalledWith("r-1");
      expect(deps.loadOrgMembership).toHaveBeenCalledWith(userId, "o-1");
    });

    it("returns empty when the restaurant has no parent org (legacy state)", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([]),
        loadOrgMembership: jest.fn(),
        loadRestaurantOrgId: jest.fn().mockResolvedValue(null),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "venue",
        restaurantId: "r-1",
      });

      expect(roles).toEqual([]);
      expect(deps.loadOrgMembership).not.toHaveBeenCalled();
    });
  });

  describe("venue scope — union of venue staff + org membership", () => {
    it("returns both venue_host and org_owner when the user holds both", async () => {
      const deps: OrgResolverDeps = {
        loadVenueStaff: jest.fn().mockResolvedValue([{ role: "host" }]),
        loadOrgMembership: jest.fn().mockResolvedValue([{ role: "owner" }]),
        loadRestaurantOrgId: jest.fn().mockResolvedValue("o-1"),
      };
      const resolver = makeOrgResolver(deps);

      const roles = await resolver.rolesForScope(userId, {
        kind: "venue",
        restaurantId: "r-1",
      });

      expect(roles).toEqual(["venue_host", "org_owner"]);
    });
  });
});
