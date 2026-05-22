/**
 * @jest-environment node
 *
 * Unit tests for mergeDinersAction per Wave 3 §03 §5.3 sub-unit D (task D1).
 * splitDinerAction tests appended in task D2.
 */

jest.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: jest.fn(),
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

import { mergeDinersAction } from "../actions";
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit } from "@/lib/audit/record";
import { createSupabaseServerClient } from "@/lib/db/server";
import { currentActor } from "@/lib/auth/current-actor";

function mockSupabaseAuth(userId: string | null) {
  return {
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
  };
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
  // Default actor — overridden per-test for impersonator scenarios.
  (currentActor as jest.Mock).mockImplementation(async (id: string) => ({
    actorUserId: id,
    impersonatorUserId: null,
  }));
});

describe("mergeDinersAction", () => {
  it("returns ok=false when not signed in", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      mockSupabaseAuth(null),
    );
    const r = await mergeDinersAction({ sourceId: "s", targetId: "t" });
    expect(r).toEqual({
      ok: false,
      error: expect.stringMatching(/signed in/i),
    });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("rejects when source diner is missing", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      mockSupabaseAuth("u1"),
    );
    (dbAdmin.select as jest.Mock).mockReturnValueOnce(mockSelectReturning([]));
    const r = await mergeDinersAction({ sourceId: "s", targetId: "t" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found/i);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("rejects cross-org merge", async () => {
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      mockSupabaseAuth("u1"),
    );
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
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      mockSupabaseAuth("admin-1"),
    );
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
    (createSupabaseServerClient as jest.Mock).mockResolvedValue(
      mockSupabaseAuth("u1"),
    );
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
