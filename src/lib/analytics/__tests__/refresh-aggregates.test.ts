import { computeBusinessDate, makeRefreshAggregates } from "@/lib/analytics/refresh-aggregates";

describe("computeBusinessDate", () => {
  test("returns venue-local yesterday (Bucharest, summer EEST +3)", () => {
    // 00:30 UTC on the 24th = 03:30 Bucharest on the 24th → yesterday = 23rd.
    expect(computeBusinessDate("Europe/Bucharest", new Date("2026-05-24T00:30:00Z"))).toBe("2026-05-23");
  });

  test("crosses the local day boundary correctly", () => {
    // 22:30 UTC on the 24th = 01:30 Bucharest on the 25th → yesterday = 24th.
    expect(computeBusinessDate("Europe/Bucharest", new Date("2026-05-24T22:30:00Z"))).toBe("2026-05-24");
  });

  test("UTC venue", () => {
    expect(computeBusinessDate("UTC", new Date("2026-05-24T10:00:00Z"))).toBe("2026-05-23");
  });
});

describe("makeRefreshAggregates", () => {
  function fakeDb(restaurants: Array<{ id: string; timezone: string }>) {
    const calls: string[] = [];
    const db = {
      execute: jest.fn(async (q: unknown) => {
        const text = JSON.stringify(q);
        calls.push(text);
        // First call selects restaurants; subsequent calls are upserts/reads.
        if (calls.length === 1) return restaurants;
        return []; // forecast observation reads etc. return empty → no forecast rows
      }),
    };
    return { db, calls };
  }

  test("no active restaurants → only the selection query runs", async () => {
    const { db, calls } = fakeDb([]);
    const handler = makeRefreshAggregates({ db: db as never, now: () => new Date("2026-05-24T00:30:00Z") });
    await handler();
    expect(calls.length).toBe(1);
  });

  test("each restaurant gets daily + lead-time + hourly passes", async () => {
    const { db } = fakeDb([{ id: "r1", timezone: "Europe/Bucharest" }]);
    const handler = makeRefreshAggregates({ db: db as never, now: () => new Date("2026-05-24T00:30:00Z") });
    await handler();
    // 1 selection + at least daily + lead-time + hourly + forecast-read = ≥5.
    expect(db.execute.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  test("processes multiple restaurants (a pass-set each)", async () => {
    const { db } = fakeDb([
      { id: "r1", timezone: "UTC" },
      { id: "r2", timezone: "Europe/Bucharest" },
    ]);
    const handler = makeRefreshAggregates({ db: db as never, now: () => new Date("2026-05-24T00:30:00Z") });
    await handler();
    // 1 selection + ≥4 passes × 2 restaurants.
    expect(db.execute.mock.calls.length).toBeGreaterThanOrEqual(9);
  });
});
