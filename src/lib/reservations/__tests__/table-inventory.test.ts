import {
  partiesFitTables,
  isBookingFeasible,
  pickTable,
} from "../table-inventory";

describe("partiesFitTables (threshold-greedy)", () => {
  it("empty parties always fit", () => {
    expect(partiesFitTables([], [2, 4])).toBe(true);
  });

  it("more parties than tables is infeasible", () => {
    expect(partiesFitTables([2, 2, 2], [4, 4])).toBe(false);
  });

  it("each party must fit a distinct table by capMax", () => {
    expect(partiesFitTables([4, 2], [4, 2])).toBe(true); // 4→4, 2→2
    expect(partiesFitTables([4, 4], [4, 2])).toBe(false); // only one 4-cap
  });

  it("largest party must get the largest table (greedy is optimal)", () => {
    // parties 6,4 vs tables 6,4 — feasible; vs 6,2 — infeasible (4 can't fit 2)
    expect(partiesFitTables([6, 4], [6, 4])).toBe(true);
    expect(partiesFitTables([6, 4], [6, 2])).toBe(false);
  });

  it("a small party can use a bigger table when needed", () => {
    expect(partiesFitTables([2], [8])).toBe(true);
  });

  it("showcase floor: 4 parties (4,4,2,6) fit the 12 mixed tables", () => {
    const caps = [2, 2, 4, 4, 4, 4, 4, 4, 6, 6, 8, 8];
    expect(partiesFitTables([4, 4, 2, 6], caps)).toBe(true);
  });
});

describe("isBookingFeasible (event points + turn-time)", () => {
  const caps = [2, 4]; // a 2-top and a 4-top
  const turn = 90;

  it("a single booking that fits any table is feasible", () => {
    expect(
      isBookingFeasible({ party: 4, startMinutes: 19 * 60, turnMinutes: turn, existing: [], capMaxes: caps }),
    ).toBe(true);
  });

  it("party larger than every table is infeasible", () => {
    expect(
      isBookingFeasible({ party: 6, startMinutes: 19 * 60, turnMinutes: turn, existing: [], capMaxes: caps }),
    ).toBe(false);
  });

  it("two overlapping parties of 4 cannot share the single 4-top", () => {
    const existing = [{ partySize: 4, startMinutes: 19 * 60 }];
    // new party 4 at 19:30 overlaps the 19:00 (90-min) booking; only one 4-cap table
    expect(
      isBookingFeasible({ party: 4, startMinutes: 19 * 60 + 30, turnMinutes: turn, existing, capMaxes: caps }),
    ).toBe(false);
  });

  it("two overlapping parties (4 and 2) fit the 4-top and 2-top", () => {
    const existing = [{ partySize: 4, startMinutes: 19 * 60 }];
    expect(
      isBookingFeasible({ party: 2, startMinutes: 19 * 60 + 30, turnMinutes: turn, existing, capMaxes: caps }),
    ).toBe(true);
  });

  it("non-overlapping bookings (>= turn apart) don't contend", () => {
    const existing = [{ partySize: 4, startMinutes: 19 * 60 }];
    // 20:30 is exactly 90 min after 19:00 → windows [19:00,20:30) and [20:30,22:00) don't overlap
    expect(
      isBookingFeasible({ party: 4, startMinutes: 19 * 60 + 90, turnMinutes: turn, existing, capMaxes: caps }),
    ).toBe(true);
  });
});

describe("pickTable (best-fit, capMin soft)", () => {
  const tables = [
    { id: "t2", capacityMin: 1, capacityMax: 2 },
    { id: "t4", capacityMin: 2, capacityMax: 4 },
    { id: "t8", capacityMin: 4, capacityMax: 8 },
  ];

  it("picks the smallest table that fits and respects capMin", () => {
    expect(
      pickTable({ party: 2, startMinutes: 0, turnMinutes: 90, tables, heldTableIds: new Set() }),
    ).toBe("t2");
    expect(
      pickTable({ party: 3, startMinutes: 0, turnMinutes: 90, tables, heldTableIds: new Set() }),
    ).toBe("t4"); // t2 too small; t4 fits & respects min; t8 min-4 not preferred
  });

  it("falls back to a min-violating table rather than returning none (capMin soft)", () => {
    // party of 2, only the 8-top (min 4) is free → still assign it
    expect(
      pickTable({ party: 2, startMinutes: 0, turnMinutes: 90, tables, heldTableIds: new Set(["t2", "t4"]) }),
    ).toBe("t8");
  });

  it("returns null when no fitting table is free", () => {
    expect(
      pickTable({ party: 8, startMinutes: 0, turnMinutes: 90, tables, heldTableIds: new Set(["t8"]) }),
    ).toBeNull();
  });
});
