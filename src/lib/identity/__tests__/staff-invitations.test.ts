/**
 * @jest-environment node
 *
 * §01 §6 staff invitation flow — invite (org + venue), claim/accept, revoke,
 * resend. The staff_invitations table is the shared substrate (migration 0018);
 * this is the previously-unbuilt action surface (build-order §13 step 10).
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/schema", () => ({
  staffInvitations: { id: "si.id", tokenHash: "si.tokenHash", status: "si.status" },
  organizationMembers: {},
  restaurantStaff: {},
  restaurants: { id: "r.id", organizationId: "r.orgId" },
}));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn((a, b) => ({ eq: [a, b] })),
  and: jest.fn((...xs) => ({ and: xs })),
  sql: Object.assign((s: TemplateStringsArray) => ({ sql: s.join("") }), { raw: (t: string) => t }),
}));

import { makeStaffInvitations } from "../staff-invitations";

const SESSION = { userId: "owner-1", profile: { role: "restaurant_owner" } } as never;

function baseDeps(over: Record<string, unknown> = {}) {
  return {
    db: {
      insert: jest.fn(() => ({ values: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ id: "inv-1" }]) })) })),
      select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([]) })) })) })),
      update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
      transaction: jest.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue(undefined) })),
          update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
        }),
      ),
    },
    recordAudit: jest.fn().mockResolvedValue(undefined),
    can: jest.fn().mockResolvedValue(true),
    sendEmail: jest.fn().mockResolvedValue({ messageId: "m1" }),
    genToken: jest.fn(() => ({ raw: "rawtoken", hash: "hashtoken" })),
    now: () => new Date("2026-05-25T12:00:00Z"),
    ...over,
  };
}

describe("inviteOrgMember", () => {
  it("forbids when the caller lacks staff.invite.org", async () => {
    const d = baseDeps({ can: jest.fn().mockResolvedValue(false) });
    const r = await makeStaffInvitations(d as never).inviteOrgMember(SESSION, {
      organizationId: "org-1",
      email: "new@x.com",
      role: "manager",
    });
    expect(r.ok).toBe(false);
    expect(d.db.insert).not.toHaveBeenCalled();
  });

  it("rejects an invalid org role", async () => {
    const d = baseDeps();
    const r = await makeStaffInvitations(d as never).inviteOrgMember(SESSION, {
      organizationId: "org-1",
      email: "new@x.com",
      role: "host", // venue role, not an org role
    });
    expect(r.ok).toBe(false);
  });

  it("inserts a pending org invitation, audits, emails, returns the raw token", async () => {
    const d = baseDeps();
    const r = await makeStaffInvitations(d as never).inviteOrgMember(SESSION, {
      organizationId: "org-1",
      email: "New@X.com",
      role: "admin",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.token).toBe("rawtoken");
    expect(d.db.insert).toHaveBeenCalled();
    expect(d.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "organization.member_invited" }));
    expect(d.sendEmail).toHaveBeenCalled();
  });
});

describe("inviteVenueStaff", () => {
  it("inserts a restaurant-kind invitation + audits staff_invited", async () => {
    const d = baseDeps();
    const r = await makeStaffInvitations(d as never).inviteVenueStaff(SESSION, {
      restaurantId: "rest-1",
      organizationId: "org-1",
      email: "host@x.com",
      role: "host",
    });
    expect(r.ok).toBe(true);
    expect(d.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "restaurant.staff_invited" }));
  });
});

describe("acceptStaffInvitation", () => {
  function inviteRow(over: Record<string, unknown> = {}) {
    return {
      id: "inv-1",
      kind: "org",
      organizationId: "org-1",
      restaurantId: null,
      email: "invitee@x.com",
      role: "manager",
      status: "pending",
      expiresAt: new Date("2026-06-10T12:00:00Z"),
      ...over,
    };
  }
  function withLookup(d: ReturnType<typeof baseDeps>, rows: unknown[]) {
    d.db.select = jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue(rows) })) })) })) as never;
    return d;
  }

  it("fails when the token matches no pending invitation", async () => {
    const d = withLookup(baseDeps(), []);
    const r = await makeStaffInvitations(d as never).acceptStaffInvitation({ token: "x", userId: "u1", userEmail: "invitee@x.com" });
    expect(r.ok).toBe(false);
  });

  it("forbids when the invitee email does not match the invitation", async () => {
    const d = withLookup(baseDeps(), [inviteRow()]);
    const r = await makeStaffInvitations(d as never).acceptStaffInvitation({ token: "x", userId: "u1", userEmail: "someone-else@x.com" });
    expect(r.ok).toBe(false);
    expect(d.db.transaction).not.toHaveBeenCalled();
  });

  it("rejects an expired invitation", async () => {
    const d = withLookup(baseDeps(), [inviteRow({ expiresAt: new Date("2026-05-01T00:00:00Z") })]);
    const r = await makeStaffInvitations(d as never).acceptStaffInvitation({ token: "x", userId: "u1", userEmail: "invitee@x.com" });
    expect(r.ok).toBe(false);
  });

  it("claims an org invitation: inserts membership, marks claimed, audits member_joined", async () => {
    const d = withLookup(baseDeps(), [inviteRow()]);
    const r = await makeStaffInvitations(d as never).acceptStaffInvitation({ token: "x", userId: "u1", userEmail: "Invitee@X.com" });
    expect(r.ok).toBe(true);
    expect(d.db.transaction).toHaveBeenCalled();
    expect(d.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "organization.member_joined" }));
  });

  it("claims a venue invitation: audits staff_added", async () => {
    const d = withLookup(baseDeps(), [inviteRow({ kind: "restaurant", organizationId: null, restaurantId: "rest-1", role: "host" })]);
    const r = await makeStaffInvitations(d as never).acceptStaffInvitation({ token: "x", userId: "u1", userEmail: "invitee@x.com" });
    expect(r.ok).toBe(true);
    expect(d.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "restaurant.staff_added" }));
  });
});

describe("revoke + resend", () => {
  function withInvite(d: ReturnType<typeof baseDeps>, row: unknown) {
    d.db.select = jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue(row ? [row] : []) })) })) })) as never;
    return d;
  }

  it("revokeStaffInvitation sets status revoked", async () => {
    const d = withInvite(baseDeps(), { id: "inv-1", kind: "org", organizationId: "org-1", restaurantId: null, status: "pending" });
    const r = await makeStaffInvitations(d as never).revokeStaffInvitation(SESSION, "inv-1");
    expect(r.ok).toBe(true);
    expect(d.db.update).toHaveBeenCalled();
  });

  it("resendStaffInvitation refuses a non-pending invitation", async () => {
    const d = withInvite(baseDeps(), { id: "inv-1", kind: "org", organizationId: "org-1", status: "revoked", expiresAt: new Date("2026-06-10T12:00:00Z") });
    const r = await makeStaffInvitations(d as never).resendStaffInvitation(SESSION, "inv-1");
    expect(r.ok).toBe(false);
  });

  it("resendStaffInvitation rotates the token + re-emails a pending invite", async () => {
    const d = withInvite(baseDeps(), { id: "inv-1", kind: "org", organizationId: "org-1", email: "a@x.com", status: "pending", expiresAt: new Date("2026-06-10T12:00:00Z") });
    const r = await makeStaffInvitations(d as never).resendStaffInvitation(SESSION, "inv-1");
    expect(r.ok).toBe(true);
    expect(d.db.update).toHaveBeenCalled();
    expect(d.sendEmail).toHaveBeenCalled();
  });
});
