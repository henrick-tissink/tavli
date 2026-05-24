/**
 * @jest-environment node
 *
 * Unit tests for mergeDinersAction + splitDinerAction per Wave 3 §03 §5.3
 * sub-unit D (tasks D1 + D2).
 *
 * Authorization (audit #1): both actions are org-scoped destructive
 * mutations. They MUST gate on `can(session, 'diner.merge'|'diner.split',
 * { kind: 'organization', id })` — being signed in is not enough. The
 * "rejects unauthorized caller" tests below are the regression guard for
 * the cross-tenant IDOR the adversarial audit found.
 */

jest.mock("@/lib/auth/session", () => ({
  getCurrentSession: jest.fn(),
}));
jest.mock("@/lib/authz/can", () => ({
  can: jest.fn(),
}));
jest.mock("@/lib/db/admin", () => ({
  dbAdmin: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    transaction: jest.fn(),
  },
}));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/auth/current-actor", () => ({
  currentActor: jest.fn(),
}));

import { mergeDinersAction, splitDinerAction } from "../actions";
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit } from "@/lib/audit/record";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { currentActor } from "@/lib/auth/current-actor";

function mockSession(userId: string | null) {
  (getCurrentSession as jest.Mock).mockResolvedValue(
    userId
      ? {
          userId,
          userEmail: `${userId}@example.com`,
          profile: {
            id: userId,
            role: "restaurant_owner",
            fullName: null,
            email: null,
            locale: "ro",
            defaultOrganizationId: null,
          },
        }
      : null,
  );
}

/**
 * Mock the chained drizzle select() builder: select(...).from(...).where(...)
 * resolving to the supplied rows.
 */
function mockSelectReturning(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: authorized. Individual tests override with false to exercise
  // the IDOR guard.
  (can as jest.Mock).mockResolvedValue(true);
  // Default actor — overridden per-test for impersonator scenarios.
  (currentActor as jest.Mock).mockImplementation(async (id: string) => ({
    actorUserId: id,
    impersonatorUserId: null,
  }));
});

describe("mergeDinersAction", () => {
  it("returns ok=false when not signed in", async () => {
    mockSession(null);
    const r = await mergeDinersAction({ sourceId: "s", targetId: "t" });
    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/signed in/i),
    });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("rejects when source diner is missing", async () => {
    mockSession("u1");
    (dbAdmin.select as jest.Mock).mockReturnValueOnce(mockSelectReturning([]));
    const r = await mergeDinersAction({ sourceId: "s", targetId: "t" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found/i);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("rejects unauthorized caller (cross-tenant IDOR) without mutating", async () => {
    mockSession("attacker");
    (can as jest.Mock).mockResolvedValue(false);
    (dbAdmin.select as jest.Mock).mockReturnValueOnce(
      mockSelectReturning([
        {
          id: "s",
          organizationId: "org-a",
          allergies: [],
          occasionTags: [],
          dietaryPreferences: [],
          seatingPreferences: {},
          internalNotes: null,
        },
        {
          id: "t",
          organizationId: "org-a",
          allergies: [],
          occasionTags: [],
          dietaryPreferences: [],
          seatingPreferences: {},
          internalNotes: null,
        },
      ]),
    );
    const r = await mergeDinersAction({ sourceId: "s", targetId: "t" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/forbidden/i);
    // can() must be checked against the diners' organization.
    expect(can).toHaveBeenCalledWith(
      expect.anything(),
      "diner.merge",
      { kind: "organization", id: "org-a" },
    );
    expect(dbAdmin.transaction).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("rejects cross-org merge", async () => {
    mockSession("u1");
    (dbAdmin.select as jest.Mock).mockReturnValueOnce(
      mockSelectReturning([
        {
          id: "s",
          organizationId: "org-a",
          allergies: [],
          occasionTags: [],
          dietaryPreferences: [],
          seatingPreferences: {},
          internalNotes: null,
        },
        {
          id: "t",
          organizationId: "org-b",
          allergies: [],
          occasionTags: [],
          dietaryPreferences: [],
          seatingPreferences: {},
          internalNotes: null,
        },
      ]),
    );
    const r = await mergeDinersAction({ sourceId: "s", targetId: "t" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cross-org/i);
    expect(dbAdmin.transaction).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("happy path: updates target + deletes source + writes audit with impersonator threading", async () => {
    mockSession("admin-1");
    (dbAdmin.select as jest.Mock).mockReturnValueOnce(
      mockSelectReturning([
        {
          id: "src",
          organizationId: "org-1",
          allergies: ["nuts"],
          occasionTags: ["birthday"],
          dietaryPreferences: ["vegan"],
          seatingPreferences: { window: true },
          internalNotes: "longer notes — much detail here",
        },
        {
          id: "tgt",
          organizationId: "org-1",
          allergies: ["dairy"],
          occasionTags: [],
          dietaryPreferences: [],
          seatingPreferences: { quiet: true },
          internalNotes: "",
        },
      ]),
    );
    const whereMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: whereMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });
    const deleteMock = jest
      .fn()
      .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) =>
      cb({ update: updateMock, delete: deleteMock }),
    );

    // Override currentActor for impersonator threading test
    (currentActor as jest.Mock).mockResolvedValueOnce({
      actorUserId: "admin-1",
      impersonatorUserId: "real-admin-99",
    });

    const r = await mergeDinersAction({ sourceId: "src", targetId: "tgt" });
    expect(r).toEqual({ ok: true, data: { targetDinerId: "tgt" } });
    expect(updateMock).toHaveBeenCalledTimes(3); // reservations, reviews, diners (profile-merge)
    expect(deleteMock).toHaveBeenCalledTimes(1); // delete source diner
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "diner.merged",
        subjectId: "tgt",
        actorUserId: "admin-1",
        impersonatorUserId: "real-admin-99",
      }),
    );
  });

  it("uses longer of two internalNotes during merge", async () => {
    mockSession("u1");
    (dbAdmin.select as jest.Mock).mockReturnValueOnce(
      mockSelectReturning([
        {
          id: "src",
          organizationId: "org-1",
          allergies: [],
          occasionTags: [],
          dietaryPreferences: [],
          seatingPreferences: {},
          internalNotes: "short",
        },
        {
          id: "tgt",
          organizationId: "org-1",
          allergies: [],
          occasionTags: [],
          dietaryPreferences: [],
          seatingPreferences: {},
          internalNotes: "this is a much longer note than the source",
        },
      ]),
    );
    const whereMock = jest.fn().mockResolvedValue(undefined);
    const setMock = jest.fn().mockReturnValue({ where: whereMock });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });
    const deleteMock = jest
      .fn()
      .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) =>
      cb({ update: updateMock, delete: deleteMock }),
    );

    const r = await mergeDinersAction({ sourceId: "src", targetId: "tgt" });
    expect(r.ok).toBe(true);
    // The 3rd update call is the diners profile-merge — assert it was passed
    // the longer (target) notes.
    const profileMergeSetCall = setMock.mock.calls[2][0];
    expect(profileMergeSetCall.internalNotes).toBe(
      "this is a much longer note than the source",
    );
  });
});

describe("splitDinerAction", () => {
  it("returns ok=false when not signed in", async () => {
    mockSession(null);
    const r = await splitDinerAction({
      sourceId: "src",
      reservationIds: ["r1"],
      newDiner: { fullName: "Bob", phone: "+40700111222" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/signed in/i);
  });

  it("rejects when new diner has neither phone nor email", async () => {
    mockSession("u1");
    const r = await splitDinerAction({
      sourceId: "src",
      reservationIds: ["r1"],
      newDiner: { fullName: "Bob" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/phone or email/i);
  });

  it("rejects when no reservations are selected", async () => {
    mockSession("u1");
    const r = await splitDinerAction({
      sourceId: "src",
      reservationIds: [],
      newDiner: { fullName: "Bob", phone: "+40700111222" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no reservations/i);
  });

  it("rejects when source diner is missing", async () => {
    mockSession("u1");
    (dbAdmin.select as jest.Mock).mockReturnValueOnce(mockSelectReturning([]));
    const r = await splitDinerAction({
      sourceId: "missing",
      reservationIds: ["r1"],
      newDiner: { fullName: "Bob", phone: "+40700111222" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/source diner not found/i);
  });

  it("rejects unauthorized caller (cross-tenant IDOR) without mutating", async () => {
    mockSession("attacker");
    (can as jest.Mock).mockResolvedValue(false);
    (dbAdmin.select as jest.Mock).mockReturnValueOnce(
      mockSelectReturning([
        {
          id: "src",
          organizationId: "org-a",
          phone: "+40700111222",
          email: null,
          locale: "ro",
          acquisitionRestaurantId: null,
        },
      ]),
    );
    const r = await splitDinerAction({
      sourceId: "src",
      reservationIds: ["r1"],
      newDiner: { fullName: "Bob", phone: "+40700999888" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/forbidden/i);
    expect(can).toHaveBeenCalledWith(
      expect.anything(),
      "diner.split",
      { kind: "organization", id: "org-a" },
    );
    expect(dbAdmin.transaction).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("rejects identity collision when new phone matches source phone", async () => {
    mockSession("u1");
    (dbAdmin.select as jest.Mock).mockReturnValueOnce(
      mockSelectReturning([
        {
          id: "src",
          organizationId: "org-1",
          phone: "+40700111222",
          email: null,
          locale: "ro",
          acquisitionRestaurantId: null,
        },
      ]),
    );
    const r = await splitDinerAction({
      sourceId: "src",
      reservationIds: ["r1"],
      newDiner: { fullName: "Bob", phone: "+40700111222" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/distinct identity/i);
  });

  it("rejects when a selected reservation is not owned by source", async () => {
    mockSession("u1");
    (dbAdmin.select as jest.Mock)
      .mockReturnValueOnce(
        mockSelectReturning([
          {
            id: "src",
            organizationId: "org-1",
            phone: null,
            email: "old@example.com",
            locale: "ro",
            acquisitionRestaurantId: null,
          },
        ]),
      )
      .mockReturnValueOnce(
        mockSelectReturning([
          { id: "r1", dinerId: "src" },
          { id: "r2", dinerId: "other-diner" },
        ]),
      );
    const r = await splitDinerAction({
      sourceId: "src",
      reservationIds: ["r1", "r2"],
      newDiner: { fullName: "Bob", phone: "+40700111222" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not owned by the source/i);
  });

  it("rejects when some reservations are not found", async () => {
    mockSession("u1");
    (dbAdmin.select as jest.Mock)
      .mockReturnValueOnce(
        mockSelectReturning([
          {
            id: "src",
            organizationId: "org-1",
            phone: null,
            email: "old@example.com",
            locale: "ro",
            acquisitionRestaurantId: null,
          },
        ]),
      )
      .mockReturnValueOnce(mockSelectReturning([{ id: "r1", dinerId: "src" }]));
    const r = await splitDinerAction({
      sourceId: "src",
      reservationIds: ["r1", "r2"],
      newDiner: { fullName: "Bob", phone: "+40700111222" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/some reservations not found/i);
  });

  it("maps partial-unique-index violations to a friendly error", async () => {
    mockSession("u1");
    (dbAdmin.select as jest.Mock)
      .mockReturnValueOnce(
        mockSelectReturning([
          {
            id: "src",
            organizationId: "org-1",
            phone: "+40700111222",
            email: null,
            locale: "ro",
            acquisitionRestaurantId: null,
          },
        ]),
      )
      .mockReturnValueOnce(mockSelectReturning([{ id: "r1", dinerId: "src" }]));
    (dbAdmin.transaction as jest.Mock).mockImplementation(async () => {
      throw new Error(
        'duplicate key value violates unique constraint "diners_org_phone_unique"',
      );
    });
    const r = await splitDinerAction({
      sourceId: "src",
      reservationIds: ["r1"],
      newDiner: { fullName: "Bob", phone: "+40700333444" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already uses that contact/i);
  });

  it("happy path: inserts new diner, moves reservations + reviews, writes audit", async () => {
    mockSession("admin-1");
    (dbAdmin.select as jest.Mock)
      .mockReturnValueOnce(
        mockSelectReturning([
          {
            id: "src",
            organizationId: "org-1",
            phone: "+40700111111",
            email: null,
            locale: "ro",
            acquisitionRestaurantId: "rest-9",
          },
        ]),
      )
      .mockReturnValueOnce(
        mockSelectReturning([
          { id: "r1", dinerId: "src" },
          { id: "r2", dinerId: "src" },
        ]),
      );

    const insertReturning = jest
      .fn()
      .mockResolvedValue([{ id: "new-diner-id" }]);
    const insertValues = jest
      .fn()
      .mockReturnValue({ returning: insertReturning });
    const insertInto = jest.fn().mockReturnValue({ values: insertValues });
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const updateUpdate = jest.fn().mockReturnValue({ set: updateSet });

    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) =>
      cb({ insert: insertInto, update: updateUpdate }),
    );

    (currentActor as jest.Mock).mockResolvedValueOnce({
      actorUserId: "admin-1",
      impersonatorUserId: "real-admin-99",
    });

    const r = await splitDinerAction({
      sourceId: "src",
      reservationIds: ["r1", "r2"],
      newDiner: { fullName: "Bob", phone: "+40700222222" },
    });

    expect(r).toEqual({ ok: true, data: { newDinerId: "new-diner-id" } });
    expect(insertInto).toHaveBeenCalledTimes(1);
    expect(updateUpdate).toHaveBeenCalledTimes(2); // reservations + reviews
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "diner.split",
        subjectId: "new-diner-id",
        actorUserId: "admin-1",
        impersonatorUserId: "real-admin-99",
        context: expect.objectContaining({
          source_diner_id: "src",
          new_diner_id: "new-diner-id",
          moved_reservation_ids: ["r1", "r2"],
        }),
      }),
    );
  });
});
