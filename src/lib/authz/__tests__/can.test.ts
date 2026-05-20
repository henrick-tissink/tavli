/**
 * @jest-environment node
 *
 * Tests for can() / requireCan(). The membership resolver is injected
 * via setMembershipResolver() so these tests don't need a database.
 */

import type { CurrentSession } from "@/lib/auth/session";
import { can, requireCan, setMembershipResolver, type MembershipResolver } from "../can";
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
