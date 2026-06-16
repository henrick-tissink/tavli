import { generateOccurrenceDates, deriveConflictDates } from "../occurrences";

describe("generateOccurrenceDates", () => {
  const rule = { dayOfWeek: 2, intervalWeeks: 1 as const, startDate: "2026-07-07", endDate: null }; // Tue

  it("weekly: every Tuesday within the window", () => {
    expect(generateOccurrenceDates(rule, { fromDate: "2026-07-07", throughDate: "2026-07-28" }))
      .toEqual(["2026-07-07", "2026-07-14", "2026-07-21", "2026-07-28"]);
  });

  it("fortnightly: every other Tuesday anchored at startDate", () => {
    expect(generateOccurrenceDates({ ...rule, intervalWeeks: 2 }, { fromDate: "2026-07-07", throughDate: "2026-08-04" }))
      .toEqual(["2026-07-07", "2026-07-21", "2026-08-04"]);
  });

  it("clips to the window (fromDate after startDate stays on the fortnightly phase)", () => {
    expect(generateOccurrenceDates({ ...rule, intervalWeeks: 2 }, { fromDate: "2026-07-15", throughDate: "2026-08-04" }))
      .toEqual(["2026-07-21", "2026-08-04"]);
  });

  it("respects endDate (inclusive)", () => {
    expect(generateOccurrenceDates({ ...rule, endDate: "2026-07-21" }, { fromDate: "2026-07-07", throughDate: "2026-08-31" }))
      .toEqual(["2026-07-07", "2026-07-14", "2026-07-21"]);
  });

  it("returns [] when the window precedes startDate", () => {
    expect(generateOccurrenceDates(rule, { fromDate: "2026-06-01", throughDate: "2026-07-06" })).toEqual([]);
  });
});

describe("deriveConflictDates", () => {
  it("returns expected dates that have no existing reservation", () => {
    expect(deriveConflictDates(["2026-07-07", "2026-07-14", "2026-07-21"], ["2026-07-07", "2026-07-21"]))
      .toEqual(["2026-07-14"]);
  });
  it("returns [] when all expected dates exist", () => {
    expect(deriveConflictDates(["2026-07-07"], ["2026-07-07"])).toEqual([]);
  });
});
