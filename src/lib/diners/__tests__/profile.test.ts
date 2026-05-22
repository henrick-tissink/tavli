/**
 * @jest-environment node
 *
 * Unit tests for getDinerProfile per Wave 3 §03 §5.1 sub-unit A.4.
 */

import { makeGetDinerProfile } from "../profile";

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

describe("getDinerProfile", () => {
  it("returns null when the diner does not exist", async () => {
    const select = buildSelectMock([[]]);
    const db = { select };
    const fn = makeGetDinerProfile({ db: db as never });
    const result = await fn("missing-diner");
    expect(result).toBeNull();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("returns diner + empty visits list when no reservations are linked", async () => {
    const dinerRow = { id: "d1", organizationId: "o1", fullName: "Alice" };
    const select = buildSelectMock([[dinerRow], []]);
    const db = { select };
    const fn = makeGetDinerProfile({ db: db as never });
    const result = await fn("d1");
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
    const select = buildSelectMock([[dinerRow], visitRows]);
    const db = { select };
    const fn = makeGetDinerProfile({ db: db as never });
    const result = await fn("d1");
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
    const db = { select };
    const fn = makeGetDinerProfile({ db: db as never });
    await fn("d1");
    expect(visitsBuilder.limit).toHaveBeenCalledWith(100);
  });
});
