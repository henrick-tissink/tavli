/**
 * @jest-environment node
 *
 * Tests for can() / requireCan(). The membership resolver is injected
 * via setMembershipResolver() so these tests don't need a database.
 */

import type { CurrentSession } from "@/lib/auth/session";
import {
  can,
  dedupRolesFor,
  requireCan,
  setMembershipResolver,
  type MembershipResolver,
  type MembershipScope,
} from "../can";
import type { MatrixRole } from "../permissions";

function adminSession(): CurrentSession {
  return {
    userId: "admin-1",
    userEmail: "admin@tavli.ro",
    profile: {
      id: "admin-1",
      role: "admin",
      fullName: "Admin",
      email: "admin@tavli.ro",
      locale: "ro",
      defaultOrganizationId: null,
    },
  };
}

function partnerSession(userId = "user-1"): CurrentSession {
  return {
    userId,
    userEmail: `${userId}@example.com`,
    profile: {
      id: userId,
      role: "restaurant_owner",
      fullName: "Partner",
      email: `${userId}@example.com`,
      locale: "ro",
      defaultOrganizationId: null,
    },
  };
}

function stubResolver(rolesByUser: Record<string, MatrixRole[]>): MembershipResolver {
  return {
    async rolesForScope(userId) {
      return rolesByUser[userId] ?? [];
    },
  };
}

describe("can()", () => {
  it("returns true for every Action when session.role is admin (shortcut)", async () => {
    // Resolver never consulted for admin — install a poisoned one to prove it.
    setMembershipResolver({
      async rolesForScope() {
        throw new Error("resolver should not be called for admin");
      },
    });

    const session = adminSession();
    expect(
      await can(session, "restaurant.delete", {
        kind: "restaurant",
        id: "r-1",
        organization_id: "o-1",
      }),
    ).toBe(true);
    expect(
      await can(session, "subscription.cancel", { kind: "organization", id: "o-1" }),
    ).toBe(true);
    expect(await can(session, "restaurant.read", { kind: "global" })).toBe(true);
  });

  it("denies non-admins on global scope (no resolver path resolves it)", async () => {
    setMembershipResolver(stubResolver({}));
    const session = partnerSession();
    expect(await can(session, "restaurant.read", { kind: "global" })).toBe(false);
  });

  it("allows venue_owner on a venue-scoped action they're granted", async () => {
    setMembershipResolver(stubResolver({ "user-1": ["venue_owner"] }));
    const session = partnerSession("user-1");
    expect(
      await can(session, "reservation.modify", {
        kind: "reservation",
        restaurant_id: "r-1",
      }),
    ).toBe(true);
  });

  it("denies venue_owner on actions the matrix excludes (e.g. staff.role.change)", async () => {
    setMembershipResolver(stubResolver({ "user-1": ["venue_owner"] }));
    const session = partnerSession("user-1");
    expect(
      await can(session, "staff.role.change", {
        kind: "staff_invitation",
        organization_id: "o-1",
      }),
    ).toBe(false);
  });

  it("union semantics: holding multiple roles grants any cell true in any of them", async () => {
    setMembershipResolver(stubResolver({ "user-1": ["venue_host", "venue_owner"] }));
    const session = partnerSession("user-1");
    // venue_host alone is denied capacity_override; venue_owner grants it.
    expect(
      await can(session, "reservation.modify.override_capacity", {
        kind: "reservation",
        restaurant_id: "r-1",
      }),
    ).toBe(true);
  });

  it("denies when resolver returns no roles for the subject's scope", async () => {
    setMembershipResolver(stubResolver({ "user-1": [] }));
    const session = partnerSession("user-1");
    expect(
      await can(session, "reservation.modify", {
        kind: "reservation",
        restaurant_id: "r-1",
      }),
    ).toBe(false);
  });
});

describe("dedupRolesFor", () => {
  // The Map injection mirrors what React's cache() does in a real
  // server context — same Map per request, fresh Map per request. We
  // can't exercise React's cache() under jest, so the dedup helper is
  // tested directly.
  it("collapses concurrent calls for the same (user, scope) into one resolver call", async () => {
    const rolesForScope = jest.fn().mockResolvedValue(["venue_owner"]);
    const resolver: MembershipResolver = { rolesForScope };
    const map = new Map<string, Promise<MatrixRole[]>>();
    const scope: MembershipScope = { kind: "venue", restaurantId: "r-1" };

    await Promise.all([
      dedupRolesFor(resolver, "user-1", scope, map),
      dedupRolesFor(resolver, "user-1", scope, map),
    ]);

    expect(rolesForScope).toHaveBeenCalledTimes(1);
  });

  it("issues separate resolver calls for different scopes", async () => {
    const rolesForScope = jest.fn().mockResolvedValue([]);
    const resolver: MembershipResolver = { rolesForScope };
    const map = new Map<string, Promise<MatrixRole[]>>();

    await dedupRolesFor(resolver, "user-1", { kind: "venue", restaurantId: "r-1" }, map);
    await dedupRolesFor(resolver, "user-1", { kind: "venue", restaurantId: "r-2" }, map);
    await dedupRolesFor(resolver, "user-2", { kind: "venue", restaurantId: "r-1" }, map);

    expect(rolesForScope).toHaveBeenCalledTimes(3);
  });
});

describe("requireCan()", () => {
  beforeEach(() => {
    setMembershipResolver(stubResolver({ "user-1": ["venue_owner"] }));
  });

  it("returns null when allowed (caller proceeds)", async () => {
    const session = partnerSession("user-1");
    const result = await requireCan(session, "reservation.modify", {
      kind: "reservation",
      restaurant_id: "r-1",
    });
    expect(result).toBeNull();
  });

  it("returns a forbidden() ActionResult when denied", async () => {
    const session = partnerSession("user-1");
    const result = await requireCan(session, "subscription.cancel", {
      kind: "organization",
      id: "o-1",
    });
    expect(result).toEqual({ ok: false, code: "forbidden" });
  });
});
