import {
  dashboardRetentionFloor,
  toPartyMixSeries,
  toCancellationDonut,
  buildHeatMapMatrix,
} from "@/lib/analytics/queries";

describe("dashboardRetentionFloor", () => {
  test("Base tier floors to 12 months before today (venue-local)", () => {
    expect(dashboardRetentionFloor("base", new Date("2026-05-17T10:00:00Z"))).toBe("2025-05-17");
  });
  test("Pro tier has no floor", () => {
    expect(dashboardRetentionFloor("pro", new Date("2026-05-17T10:00:00Z"))).toBeNull();
  });
});

describe("toPartyMixSeries", () => {
  test("sums party-size buckets across the window", () => {
    const rows = [
      { party_size_1_2: 5, party_size_3_4: 3, party_size_5_6: 1, party_size_7_plus: 0 },
      { party_size_1_2: 2, party_size_3_4: 1, party_size_5_6: 0, party_size_7_plus: 2 },
    ];
    expect(toPartyMixSeries(rows)).toEqual([
      { bucket: "1–2", count: 7 },
      { bucket: "3–4", count: 4 },
      { bucket: "5–6", count: 1 },
      { bucket: "7+", count: 2 },
    ]);
  });
});

describe("toCancellationDonut", () => {
  test("maps cancel-reason columns to donut slices, dropping zeros", () => {
    const row = {
      cancel_reason_restaurant_closed: 2,
      cancel_reason_overbooked: 0,
      cancel_reason_kitchen_issue: 1,
      cancel_reason_private_event: 0,
      cancel_reason_other: 3,
      cancel_reason_diner: 4,
    };
    expect(toCancellationDonut(row)).toEqual([
      { reason: "restaurant_closed", count: 2 },
      { reason: "kitchen_issue", count: 1 },
      { reason: "other", count: 3 },
      { reason: "diner", count: 4 },
    ]);
  });
});

describe("buildHeatMapMatrix", () => {
  test("produces a 7×24 grid keyed by dow/hour with no-show rate", () => {
    const rows = [
      { day_of_week: 1, hour_of_day: 19, no_show_rate: "0.2500" },
      { day_of_week: 6, hour_of_day: 21, no_show_rate: "0.1000" },
    ];
    const grid = buildHeatMapMatrix(rows);
    expect(grid).toHaveLength(7);
    expect(grid[0]).toHaveLength(24);
    expect(grid[1][19]).toBeCloseTo(0.25);
    expect(grid[6][21]).toBeCloseTo(0.1);
    expect(grid[0][0]).toBeNull(); // no data
  });
});
