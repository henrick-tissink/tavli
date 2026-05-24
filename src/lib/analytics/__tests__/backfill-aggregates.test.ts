import { enumerateDays, makeBackfillAggregates } from "@/lib/analytics/backfill-aggregates";

describe("enumerateDays", () => {
  test("inclusive range", () => {
    expect(enumerateDays("2026-05-22", "2026-05-24")).toEqual(["2026-05-22", "2026-05-23", "2026-05-24"]);
  });
  test("single day", () => {
    expect(enumerateDays("2026-05-23", "2026-05-23")).toEqual(["2026-05-23"]);
  });
  test("start after end → empty", () => {
    expect(enumerateDays("2026-05-25", "2026-05-23")).toEqual([]);
  });
  test("crosses a month boundary", () => {
    expect(enumerateDays("2026-04-30", "2026-05-01")).toEqual(["2026-04-30", "2026-05-01"]);
  });
});

describe("makeBackfillAggregates", () => {
  // execute call order: 1=restaurants, 2=earliest, 3=lastDone, then per day
  // (refreshRestaurantDay = 3 calls), then forecast history read.
  function fakeDb(opts: { restaurants: Array<{ id: string; timezone: string }>; earliest: string | null; lastDone: string | null }) {
    let call = 0;
    const db = {
      execute: jest.fn(async () => {
        call++;
        if (call === 1) return opts.restaurants;
        if (call === 2) return [{ min: opts.earliest }];
        if (call === 3) return [{ max: opts.lastDone }];
        return []; // per-day upserts + forecast history
      }),
    };
    return db;
  }

  test("no restaurants → only selection", async () => {
    const db = fakeDb({ restaurants: [], earliest: null, lastDone: null });
    await makeBackfillAggregates({ db: db as never, now: () => new Date("2026-05-24T00:30:00Z") })();
    expect(db.execute.mock.calls.length).toBe(1);
  });

  test("restaurant with no reservations → no day work", async () => {
    const db = fakeDb({ restaurants: [{ id: "r1", timezone: "UTC" }], earliest: null, lastDone: null });
    await makeBackfillAggregates({ db: db as never, now: () => new Date("2026-05-24T00:30:00Z") })();
    // select restaurants + earliest (null) → skip. 2 calls.
    expect(db.execute.mock.calls.length).toBe(2);
  });

  test("resumes from lastDone+1; 2 days × 3 passes + forecast", async () => {
    // UTC venue, now 05-24 → yesterday = 05-23. lastDone 05-21 → start 05-22.
    // days [05-22, 05-23] → 2 × 3 = 6 upsert calls + 1 forecast read.
    const db = fakeDb({ restaurants: [{ id: "r1", timezone: "UTC" }], earliest: "2026-01-01", lastDone: "2026-05-21" });
    await makeBackfillAggregates({ db: db as never, now: () => new Date("2026-05-24T00:30:00Z") })();
    // 1 (restaurants) + 1 (earliest) + 1 (lastDone) + 6 (days) + 1 (forecast) = 10
    expect(db.execute.mock.calls.length).toBe(10);
  });
});
