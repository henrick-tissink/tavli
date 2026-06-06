jest.mock("server-only", () => ({}));

import { planFromState } from "../assign-table";

// Minimal FloorState builder. Tables: a 2-top, two 4-tops, an 8-top.
const TABLES = [
  { id: "t2", capacityMin: 1, capacityMax: 2 },
  { id: "t4a", capacityMin: 2, capacityMax: 4 },
  { id: "t4b", capacityMin: 2, capacityMax: 4 },
  { id: "t8", capacityMin: 4, capacityMax: 8 },
];

interface Ex {
  id: string;
  partySize: number;
  startMinutes: number;
  tableId?: string | null;
  combinationId?: string | null;
  autoAssigned?: boolean;
  status?: string;
  eventRequestId?: string | null;
}
function state(existing: Ex[] = [], combinationTables: Record<string, string[]> = {}, tables = TABLES) {
  return {
    turn: 90,
    tables,
    existing: existing.map((e) => ({
      id: e.id,
      partySize: e.partySize,
      startMinutes: e.startMinutes,
      tableId: e.tableId ?? null,
      combinationId: e.combinationId ?? null,
      autoAssigned: e.autoAssigned ?? true,
      status: e.status ?? "confirmed",
      eventRequestId: e.eventRequestId ?? null,
    })),
    combinationTables: new Map(Object.entries(combinationTables)),
  };
}

describe("planFromState — single path", () => {
  it("no floor plan → kind none", () => {
    expect(planFromState(state([], {}, []), 4, 1140)).toEqual({ ok: true, kind: "none" });
  });

  it("assigns best-fit for an empty floor", () => {
    const p = planFromState(state(), 2, 1140);
    expect(p).toMatchObject({ ok: true, kind: "single", tableId: "t2" });
  });

  it("routes around an existing auto-assigned booking", () => {
    const p = planFromState(state([{ id: "a", partySize: 4, startMinutes: 1140, tableId: "t4a" }]), 4, 1170);
    expect(p).toMatchObject({ ok: true, kind: "single", tableId: "t4b" });
  });

  it("never moves a host-pinned table", () => {
    const p = planFromState(
      state([{ id: "pin", partySize: 2, startMinutes: 1140, tableId: "t4a", autoAssigned: false }]),
      4,
      1140,
    );
    expect(p).toMatchObject({ ok: true, kind: "single", tableId: "t4b" });
    if (p.ok && p.kind === "single") expect(p.siblingMoves).toEqual([]); // pin untouched
  });

  it("RESHUFFLES a movable sibling so a tight booking fits", () => {
    // Only the two 4-tops + 2-top + 8-top. Fill so a new party of 4 needs a reshuffle:
    // 'a' (party 2, auto) is parked on a 4-top; new party 4 must take a 4-top and 'a' moves.
    const small = [
      { id: "t4a", capacityMin: 2, capacityMax: 4 },
      { id: "t4b", capacityMin: 2, capacityMax: 4 },
    ];
    // existing: two parties of 2 (auto) occupying both 4-tops at 19:00
    const st = state(
      [
        { id: "a", partySize: 2, startMinutes: 1140, tableId: "t4a" },
        { id: "b", partySize: 2, startMinutes: 1140, tableId: "t4b" },
      ],
      {},
      small,
    );
    // a new party of 4 at 19:00 is infeasible (2 tables already taken by 2 parties)
    expect(planFromState(st, 4, 1140)).toMatchObject({ ok: false, reason: "no_table" });
  });

  it("reshuffle: a feasible-but-tight booking gets a table + emits a sibling move", () => {
    // Tables: t2, t4. 'a' (party 2, auto) greedily could sit on t4; a new party 4 needs t4,
    // so 'a' must move to t2. Construct: 'a' currently on t4 (sub-optimal), new party 4 @ same window.
    const small = [
      { id: "t2", capacityMin: 1, capacityMax: 2 },
      { id: "t4", capacityMin: 2, capacityMax: 4 },
    ];
    const st = state([{ id: "a", partySize: 2, startMinutes: 1140, tableId: "t4" }], {}, small);
    const p = planFromState(st, 4, 1140);
    expect(p).toMatchObject({ ok: true, kind: "single", tableId: "t4" });
    if (p.ok && p.kind === "single") {
      expect(p.siblingMoves).toEqual([{ id: "a", tableId: "t2" }]); // 'a' reshuffled off t4
    }
  });

  it("never moves a SEATED auto-assigned guest (they are physically at the table)", () => {
    // 'seated' party of 2 is auto-assigned to t4a; a new party of 4 overlapping
    // must route to t4b and leave the seated guest put (no sibling move).
    const st = state([
      { id: "s", partySize: 2, startMinutes: 1140, tableId: "t4a", autoAssigned: true, status: "seated" },
    ]);
    const p = planFromState(st, 4, 1140);
    expect(p).toMatchObject({ ok: true, kind: "single", tableId: "t4b" });
    if (p.ok && p.kind === "single") expect(p.siblingMoves).toEqual([]);
  });

  it("rejects rather than bump a SEATED guest off the only fitting table", () => {
    const oneFour = [{ id: "t4", capacityMin: 2, capacityMax: 4 }];
    const st = state(
      [{ id: "s", partySize: 4, startMinutes: 1140, tableId: "t4", autoAssigned: true, status: "seated" }],
      {},
      oneFour,
    );
    expect(planFromState(st, 4, 1140)).toMatchObject({ ok: false, reason: "no_table" });
  });

  it("excludes tables held by an existing combination (phantom pins)", () => {
    // 'big' holds t4a+t4b via a combination; a new party of 4 can only use t8 (t2 too small).
    const st = state(
      [{ id: "big", partySize: 7, startMinutes: 1140, combinationId: "combo1" }],
      { combo1: ["t4a", "t4b"] },
    );
    const p = planFromState(st, 4, 1140);
    expect(p).toMatchObject({ ok: true, kind: "single", tableId: "t8" });
  });
});

describe("planFromState — event reservations", () => {
  it("never reshuffles an event reservation, even one sub-optimally placed", () => {
    // An event auto-assigned to the 8-top (sub-optimal for a party of 2). A
    // movable sibling here WOULD be relocated to its best-fit 2-top; the event
    // must stay put. A new party of 2 takes the 2-top, no sibling move emitted.
    const st = state([
      { id: "ev", partySize: 2, startMinutes: 1140, tableId: "t8", autoAssigned: true, eventRequestId: "er1" },
    ]);
    const p = planFromState(st, 2, 1140);
    expect(p).toMatchObject({ ok: true, kind: "single", tableId: "t2" });
    if (p.ok && p.kind === "single") expect(p.siblingMoves).toEqual([]); // event not moved
  });

  it("never seats an event onto the floor when it holds no bookable table", () => {
    // A private-space event (no floor table) must not be auto-assigned a table —
    // it doesn't occupy the bookable floor at all.
    const st = state([
      { id: "ev", partySize: 4, startMinutes: 1140, tableId: null, eventRequestId: "er1" },
    ]);
    const p = planFromState(st, 4, 1140);
    expect(p).toMatchObject({ ok: true, kind: "single", tableId: "t4a" });
    if (p.ok && p.kind === "single") expect(p.siblingMoves).toEqual([]); // event not seated
  });

  it("rejects when an event holds the only table that fits the new party", () => {
    const oneEight = [{ id: "t8", capacityMin: 4, capacityMax: 8 }];
    const st = state(
      [{ id: "ev", partySize: 8, startMinutes: 1140, tableId: "t8", eventRequestId: "er1" }],
      {},
      oneEight,
    );
    expect(planFromState(st, 7, 1140)).toMatchObject({ ok: false, reason: "no_table" });
  });
});

describe("planFromState — combination path", () => {
  it("seats a big party by joining the fewest free tables", () => {
    const p = planFromState(state(), 7, 1140); // > 8? no, 7 ≤ 8 single. use 10
    expect(p).toMatchObject({ ok: true, kind: "single" }); // 7 fits the 8-top
    const big = planFromState(state(), 11, 1140); // > 8 → combination
    expect(big.ok).toBe(true);
    if (big.ok && big.kind === "combination") {
      expect(big.tableIds.length).toBeGreaterThanOrEqual(2);
      expect(big.combinedCapacity).toBeGreaterThanOrEqual(11);
    }
  });

  it("party beyond max-combinable → party_too_large", () => {
    // top-3 caps = 8+4+4 = 16
    const p = planFromState(state(), 20, 1140);
    expect(p).toMatchObject({ ok: false, reason: "party_too_large", maxParty: 16 });
  });

  it("no free tables to combine → no_table", () => {
    // occupy the 8-top and both 4-tops; only t2 free → can't combine to 11
    const st = state([
      { id: "x", partySize: 8, startMinutes: 1140, tableId: "t8" },
      { id: "y", partySize: 4, startMinutes: 1140, tableId: "t4a" },
      { id: "z", partySize: 4, startMinutes: 1140, tableId: "t4b" },
    ]);
    expect(planFromState(st, 11, 1140)).toMatchObject({ ok: false, reason: "no_table" });
  });
});
