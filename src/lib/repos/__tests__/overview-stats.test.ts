jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({
  restaurantViewEvents: { restaurantId: {}, occurredAt: {} },
  restaurantSaves: { restaurantId: {} },
  reservations: { restaurantId: {}, reservationDate: {}, status: {} },
}));

import { makeGetOverviewStats } from "../overview-stats";

function makeDb(counts: number[]) {
  let call = 0;
  return {
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => Promise.resolve([{ count: counts[call++] }])),
      }),
    })),
  };
}

describe("getOverviewStats", () => {
  it("returns views/saves/upcoming reservation counts", async () => {
    const db = makeDb([42, 7, 12]);
    const stats = await makeGetOverviewStats({ db: db as never })("r-1");
    expect(stats).toEqual({ viewsThisWeek: 42, saves: 7, upcomingReservations: 12 });
    expect(db.select).toHaveBeenCalledTimes(3);
  });

  it("returns null in mock mode without touching the DB", async () => {
    const db = makeDb([1, 1, 1]);
    const stats = await makeGetOverviewStats({ db: db as never, enabled: () => false })("5");
    expect(stats).toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });
});
