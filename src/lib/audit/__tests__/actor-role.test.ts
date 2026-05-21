/**
 * @jest-environment node
 */

import type { GetActorRoleDeps } from "../actor-role";
import { makeGetActorRole } from "../actor-role";
import type { CurrentSession } from "@/lib/auth/session";

function session(
  opts: { userId?: string; role?: "admin" | "restaurant_owner" | "consumer" } = {},
): CurrentSession {
  return {
    userId: opts.userId ?? "u-1",
    userEmail: "u-1@example.com",
    profile: {
      id: opts.userId ?? "u-1",
      role: opts.role ?? "restaurant_owner",
      fullName: null,
      email: "u-1@example.com",
      locale: "ro",
      defaultOrganizationId: null,
    },
  } as CurrentSession;
}

describe("getActorRole", () => {
  it("returns 'diner' when session is null", async () => {
    const deps: GetActorRoleDeps = {
      loadVenueStaff: jest.fn(),
      loadOrgMembershipForRestaurant: jest.fn(),
    };
    const helper = makeGetActorRole(deps);
    expect(await helper(null, "r-1")).toBe("diner");
    expect(deps.loadVenueStaff).not.toHaveBeenCalled();
  });

  it("returns 'tavli_admin' when profile.role === 'admin'", async () => {
    const deps: GetActorRoleDeps = {
      loadVenueStaff: jest.fn(),
      loadOrgMembershipForRestaurant: jest.fn(),
    };
    const helper = makeGetActorRole(deps);
    expect(await helper(session({ role: "admin" }), "r-1")).toBe("tavli_admin");
    expect(deps.loadVenueStaff).not.toHaveBeenCalled();
  });

  it("org_admin wins over venue_owner when the user holds both", async () => {
    const deps: GetActorRoleDeps = {
      loadVenueStaff: jest.fn().mockResolvedValue([{ role: "owner" }]),
      loadOrgMembershipForRestaurant: jest.fn().mockResolvedValue([{ role: "admin" }]),
    };
    const helper = makeGetActorRole(deps);
    expect(await helper(session(), "r-1")).toBe("org_admin");
  });

  it("falls back to venue_host when only venue_host membership exists", async () => {
    const deps: GetActorRoleDeps = {
      loadVenueStaff: jest.fn().mockResolvedValue([{ role: "host" }]),
      loadOrgMembershipForRestaurant: jest.fn().mockResolvedValue([]),
    };
    const helper = makeGetActorRole(deps);
    expect(await helper(session(), "r-1")).toBe("venue_host");
  });

  it("returns 'diner' for an authenticated user with no memberships", async () => {
    const deps: GetActorRoleDeps = {
      loadVenueStaff: jest.fn().mockResolvedValue([]),
      loadOrgMembershipForRestaurant: jest.fn().mockResolvedValue([]),
    };
    const helper = makeGetActorRole(deps);
    expect(await helper(session(), "r-1")).toBe("diner");
  });
});
