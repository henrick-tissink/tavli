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
}));

import { makeReadActiveCookieConsent } from "../read";

const FIXED_NOW = new Date("2026-05-23T10:00:00.000Z");

function makeDb(rows: Array<{ essential: boolean; analytics: boolean; marketingTracking: boolean }>) {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
  };
}

describe("makeReadActiveCookieConsent", () => {
  it("returns the active consent row when one exists", async () => {
    const db = makeDb([{ essential: true, analytics: true, marketingTracking: false }]);
    const read = makeReadActiveCookieConsent({ db: db as any, now: () => FIXED_NOW });

    const result = await read("session-uuid-1");

    expect(result).toEqual({ essential: true, analytics: true, marketingTracking: false });
  });

  it("returns null when no active consent row exists", async () => {
    const db = makeDb([]);
    const read = makeReadActiveCookieConsent({ db: db as any, now: () => FIXED_NOW });

    const result = await read("session-uuid-2");

    expect(result).toBeNull();
  });

  it("applies revokedAt IS NULL predicate (null for revoked rows)", async () => {
    const { isNull } = jest.requireMock("drizzle-orm");
    const { cookieConsents } = jest.requireMock("@/lib/db/schema");

    const db = makeDb([]);
    const read = makeReadActiveCookieConsent({ db: db as any, now: () => FIXED_NOW });
    await read("session-uuid-3");

    expect(isNull).toHaveBeenCalledWith(cookieConsents.revokedAt);
  });

  it("applies gt predicate to filter expired rows", async () => {
    const { gt } = jest.requireMock("drizzle-orm");
    const { cookieConsents } = jest.requireMock("@/lib/db/schema");

    const db = makeDb([]);
    const read = makeReadActiveCookieConsent({ db: db as any, now: () => FIXED_NOW });
    await read("session-uuid-4");

    expect(gt).toHaveBeenCalledWith(cookieConsents.expiresAt, FIXED_NOW);
  });

  it("filters by the provided visitorSessionId", async () => {
    const { eq } = jest.requireMock("drizzle-orm");
    const { cookieConsents } = jest.requireMock("@/lib/db/schema");

    const db = makeDb([]);
    const read = makeReadActiveCookieConsent({ db: db as any, now: () => FIXED_NOW });
    await read("my-session-id");

    expect(eq).toHaveBeenCalledWith(cookieConsents.visitorSessionId, "my-session-id");
  });

  it("orders by grantedAt DESC and limits to 1", async () => {
    const { desc } = jest.requireMock("drizzle-orm");
    const { cookieConsents } = jest.requireMock("@/lib/db/schema");

    const db = makeDb([]);
    const read = makeReadActiveCookieConsent({ db: db as any, now: () => FIXED_NOW });
    await read("session-uuid-5");

    expect(desc).toHaveBeenCalledWith(cookieConsents.grantedAt);
    const limitFn = db.select().from().where().orderBy().limit as jest.Mock;
    expect(limitFn).toHaveBeenCalledWith(1);
  });
});
