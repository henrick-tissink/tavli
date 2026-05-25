/**
 * @jest-environment node
 *
 * Unit tests for getDinerProfile per Wave 3 §03 §5.1 sub-unit A.4.
 * NEW-11: getDinerProfile self-audits the unmasked PII reveal through
 * revealPiiBatch (the §5.5 control is enforced by construction, not left to
 * the caller).
 */

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return { ...actual, eq: jest.fn(actual.eq), and: jest.fn(actual.and) };
});

import { makeGetDinerProfile } from "../profile";
import { eq, and } from "drizzle-orm";

function buildSelectMock(results: Array<unknown[]>) {
  return jest.fn().mockImplementation(() => {
    const builder: Record<string, unknown> = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockImplementation(() => Promise.resolve(results.shift())),
    };
    return builder;
  });
}

// passthrough that runs the loader so the select-mock still drives results,
// while letting us assert the PII-access audit metadata.
const passthroughReveal = jest.fn(async (input: any) => input.loader(input.dinerIds));
const ACTOR = { actorUserId: "admin-1", organizationId: "o1" };

function profileFn(select: unknown) {
  return makeGetDinerProfile({ db: { select } as never, revealPiiBatch: passthroughReveal as never });
}

describe("getDinerProfile", () => {
  beforeEach(() => passthroughReveal.mockClear());

  it("audits the PII reveal before returning the unmasked diner (NEW-11)", async () => {
    const dinerRow = { id: "d1", organizationId: "o1", fullName: "Alice", phone: "+40700111222" };
    const fn = profileFn(buildSelectMock([[dinerRow], []]));
    await fn({ ...ACTOR, dinerId: "d1" });
    expect(passthroughReveal).toHaveBeenCalledWith(
      expect.objectContaining({
        dinerIds: ["d1"],
        actorUserId: "admin-1",
        organizationId: "o1",
        accessKind: "reveal",
      }),
    );
  });

  it("scopes the diner load to the caller's organization (NEW-B cross-org PII read)", async () => {
    (eq as jest.Mock).mockClear();
    (and as jest.Mock).mockClear();
    const dinerBuilder = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: "d1", organizationId: "o1" }]),
    };
    const visitsBuilder = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    let call = 0;
    const fn = profileFn(jest.fn(() => (++call === 1 ? dinerBuilder : visitsBuilder)));
    await fn({ ...ACTOR, dinerId: "d1" });
    // the diner loader must filter by organization_id (and the id), not id alone
    expect(and).toHaveBeenCalled();
    expect((eq as jest.Mock).mock.calls.some((c) => c[1] === "o1")).toBe(true);
  });

  it("returns null when the diner does not exist", async () => {
    const fn = profileFn(buildSelectMock([[]]));
    const result = await fn({ ...ACTOR, dinerId: "missing-diner" });
    expect(result).toBeNull();
  });

  it("returns diner + empty visits list when no reservations are linked", async () => {
    const dinerRow = { id: "d1", organizationId: "o1", fullName: "Alice" };
    const fn = profileFn(buildSelectMock([[dinerRow], []]));
    const result = await fn({ ...ACTOR, dinerId: "d1" });
    expect(result).not.toBeNull();
    expect(result!.diner).toBe(dinerRow);
    expect(result!.visits).toEqual([]);
  });

  it("returns diner + visit history (already desc-sorted by DB) and combines date+time", async () => {
    const dinerRow = { id: "d1", organizationId: "o1", fullName: "Alice" };
    const visitRows = [
      {
        reservationId: "r2",
        restaurantId: "rest-1",
        restaurantName: "Acme",
        reservationDate: "2026-05-20",
        reservationTime: "19:30:00",
        status: "confirmed",
        partySize: 4,
      },
      {
        reservationId: "r1",
        restaurantId: "rest-1",
        restaurantName: "Acme",
        reservationDate: "2026-04-10",
        reservationTime: "20:00:00",
        status: "completed",
        partySize: 2,
      },
    ];
    const fn = profileFn(buildSelectMock([[dinerRow], visitRows]));
    const result = await fn({ ...ACTOR, dinerId: "d1" });
    expect(result!.visits).toEqual([
      {
        reservationId: "r2",
        restaurantId: "rest-1",
        restaurantName: "Acme",
        occurredAt: "2026-05-20T19:30:00",
        status: "confirmed",
        partySize: 4,
      },
      {
        reservationId: "r1",
        restaurantId: "rest-1",
        restaurantName: "Acme",
        occurredAt: "2026-04-10T20:00:00",
        status: "completed",
        partySize: 2,
      },
    ]);
  });

  it("applies a limit of 100 to the visits query", async () => {
    const dinerRow = { id: "d1" };
    const visitsBuilder = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    };
    const dinerBuilder = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([dinerRow]),
    };
    let call = 0;
    const select = jest.fn().mockImplementation(() => {
      call += 1;
      return call === 1 ? dinerBuilder : visitsBuilder;
    });
    const fn = profileFn(select);
    await fn({ ...ACTOR, dinerId: "d1" });
    expect(visitsBuilder.limit).toHaveBeenCalledWith(100);
  });
});
