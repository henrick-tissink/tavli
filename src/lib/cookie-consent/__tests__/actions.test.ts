/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({
  cookieConsents: {
    visitorSessionId: "visitor_session_id",
    analytics: "analytics",
    marketingTracking: "marketing_tracking",
    dinerId: "diner_id",
    organizationId: "organization_id",
    essential: "essential",
    grantedAt: "granted_at",
    expiresAt: "expires_at",
    revokedAt: "revoked_at",
    id: "id",
  },
}));
jest.mock("drizzle-orm", () => ({
  sql: jest.fn(),
  and: jest.fn((...args: unknown[]) => ({ op: "and", args })),
  eq: jest.fn((col: unknown, val: unknown) => ({ col, val, op: "eq" })),
  isNull: jest.fn((col: unknown) => ({ col, op: "isNull" })),
  gt: jest.fn((col: unknown, val: unknown) => ({ col, val, op: "gt" })),
  desc: jest.fn((col: unknown) => ({ col, op: "desc" })),
  lt: jest.fn((col: unknown, val: unknown) => ({ col, val, op: "lt" })),
}));

import { makeRecordCookieConsent } from "../actions";

const FIXED_NOW = new Date("2026-05-23T10:00:00.000Z");

function makeDb(insertedRows: Array<{ id: string }> = [{ id: "consent-1" }]) {
  return {
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockResolvedValue(insertedRows),
    }),
  };
}

describe("makeRecordCookieConsent", () => {
  it("inserts a row with correct fields", async () => {
    const db = makeDb();
    const record = makeRecordCookieConsent({ db: db as any, now: () => FIXED_NOW });

    await record({
      visitorSessionId: "session-uuid-1",
      analytics: true,
      marketingTracking: false,
    });

    expect(db.insert).toHaveBeenCalledTimes(1);
    const insertValues = db.insert().values;
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        visitorSessionId: "session-uuid-1",
        analytics: true,
        marketingTracking: false,
        essential: true,
        grantedAt: FIXED_NOW,
      }),
    );
  });

  it("sets expires_at to 13 months from now", async () => {
    const db = makeDb();
    const record = makeRecordCookieConsent({ db: db as any, now: () => FIXED_NOW });

    await record({
      visitorSessionId: "session-uuid-2",
      analytics: false,
      marketingTracking: false,
    });

    const insertValues = db.insert().values;
    const call = (insertValues as jest.Mock).mock.calls[0][0] as { expiresAt: Date };
    const expected = new Date(FIXED_NOW);
    expected.setMonth(expected.getMonth() + 13);
    expect(call.expiresAt).toEqual(expected);
  });

  it("sets dinerId and organizationId when provided", async () => {
    const db = makeDb();
    const record = makeRecordCookieConsent({ db: db as any, now: () => FIXED_NOW });

    await record({
      visitorSessionId: "session-uuid-3",
      analytics: true,
      marketingTracking: true,
      dinerId: "diner-abc",
      organizationId: "org-xyz",
    });

    const insertValues = db.insert().values;
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        dinerId: "diner-abc",
        organizationId: "org-xyz",
      }),
    );
  });

  it("sets dinerId and organizationId to null when not provided", async () => {
    const db = makeDb();
    const record = makeRecordCookieConsent({ db: db as any, now: () => FIXED_NOW });

    await record({
      visitorSessionId: "session-uuid-4",
      analytics: false,
      marketingTracking: false,
    });

    const insertValues = db.insert().values;
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        dinerId: null,
        organizationId: null,
      }),
    );
  });

  it("uses a fresh now() on each invocation", async () => {
    let callCount = 0;
    const times = [
      new Date("2026-05-23T10:00:00.000Z"),
      new Date("2026-05-23T11:00:00.000Z"),
    ];
    const db = makeDb();
    const record = makeRecordCookieConsent({
      db: db as any,
      now: () => times[callCount++] ?? FIXED_NOW,
    });

    await record({ visitorSessionId: "s1", analytics: false, marketingTracking: false });
    await record({ visitorSessionId: "s2", analytics: false, marketingTracking: false });

    const insertValues = db.insert().values as jest.Mock;
    const calls = insertValues.mock.calls;
    expect(calls[0][0].grantedAt).toEqual(times[0]);
    expect(calls[1][0].grantedAt).toEqual(times[1]);
  });
});
