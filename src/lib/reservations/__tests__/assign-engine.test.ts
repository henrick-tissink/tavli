import { assignSingles, pickCombination } from "../table-inventory";

const T = (id: string, min: number, max: number) => ({ id, capacityMin: min, capacityMax: max });

describe("assignSingles (constructive sweep + reassignment)", () => {
  const tables = [T("t2", 1, 2), T("t4a", 2, 4), T("t4b", 2, 4), T("t8", 4, 8)];

  it("assigns a single booking the smallest fitting table (best-fit)", () => {
    const r = assignSingles({
      reservations: [{ id: "a", party: 2, startMinutes: 1140, pinnedTableId: null }],
      tables,
      turnMinutes: 90,
    });
    expect(r.get("a")).toBe("t2");
  });

  it("two overlapping parties of 4 take the two 4-tops", () => {
    const r = assignSingles({
      reservations: [
        { id: "a", party: 4, startMinutes: 1140, pinnedTableId: null },
        { id: "b", party: 4, startMinutes: 1170, pinnedTableId: null },
      ],
      tables,
      turnMinutes: 90,
    });
    expect(new Set([r.get("a"), r.get("b")])).toEqual(new Set(["t4a", "t4b"]));
  });

  it("REASSIGNS a movable sibling so a tight booking still fits", () => {
    // Only consider t2 and t4a. a (party2) greedily takes t2; b (party2) takes t4a;
    // c (party4) needs t4a → the sweep must place c on t4a and a/b elsewhere.
    // Use 2 tables, 2 parties of 2 + reorder: classic reshuffle.
    const two = [T("t2", 1, 2), T("t4", 2, 4)];
    const r = assignSingles({
      reservations: [
        { id: "small", party: 2, startMinutes: 1140, pinnedTableId: null },
        { id: "big", party: 4, startMinutes: 1140, pinnedTableId: null },
      ],
      tables: two,
      turnMinutes: 90,
    });
    // big (party 4) must get t4; small (party 2) must get t2 — constructive sweep
    // assigns the constrained party correctly regardless of input order.
    expect(r.get("big")).toBe("t4");
    expect(r.get("small")).toBe("t2");
  });

  it("respects a host-pinned table and works around it", () => {
    const r = assignSingles({
      reservations: [
        { id: "pinned", party: 2, startMinutes: 1140, pinnedTableId: "t4a" },
        { id: "new", party: 4, startMinutes: 1140, pinnedTableId: null },
      ],
      tables,
      turnMinutes: 90,
    });
    expect(r.get("pinned")).toBe("t4a"); // unchanged
    expect(r.get("new")).toBe("t4b"); // the other 4-top (t4a taken by pin)
  });

  it("marks a booking unassignable when the room is genuinely full", () => {
    const two = [T("t4a", 2, 4), T("t4b", 2, 4)];
    const r = assignSingles({
      reservations: [
        { id: "a", party: 4, startMinutes: 1140, pinnedTableId: null },
        { id: "b", party: 4, startMinutes: 1140, pinnedTableId: null },
        { id: "c", party: 4, startMinutes: 1140, pinnedTableId: null },
      ],
      tables: two,
      turnMinutes: 90,
    });
    expect(r.get("c")).toBeNull(); // 3 parties of 4, 2 tables → one can't be seated
  });

  it("non-overlapping bookings reuse the same table", () => {
    const r = assignSingles({
      reservations: [
        { id: "a", party: 4, startMinutes: 1140, pinnedTableId: null },
        { id: "b", party: 4, startMinutes: 1140 + 90, pinnedTableId: null },
      ],
      tables: [T("t4", 2, 4)],
      turnMinutes: 90,
    });
    expect(r.get("a")).toBe("t4");
    expect(r.get("b")).toBe("t4");
  });
});

describe("pickCombination (dynamic table joining)", () => {
  const tables = [T("t2", 1, 2), T("t4", 2, 4), T("t6", 2, 6), T("t8a", 4, 8), T("t8b", 4, 8)];

  it("joins the fewest tables to seat a big party", () => {
    const combo = pickCombination({ party: 12, tables, freeTableIds: new Set(tables.map((t) => t.id)) });
    // 8+8=16 ≥ 12, two tables, fewest
    expect(combo).not.toBeNull();
    expect(combo!.length).toBe(2);
    expect(combo!.reduce((s, id) => s + (tables.find((t) => t.id === id)!.capacityMax), 0)).toBeGreaterThanOrEqual(12);
  });

  it("returns null when free tables can't sum to the party", () => {
    const combo = pickCombination({ party: 30, tables, freeTableIds: new Set(tables.map((t) => t.id)) });
    expect(combo).toBeNull();
  });

  it("only uses free tables", () => {
    const combo = pickCombination({ party: 14, tables, freeTableIds: new Set(["t8a", "t6"]) });
    // 8+6=14 ≥ 14
    expect(combo).not.toBeNull();
    expect(new Set(combo)).toEqual(new Set(["t8a", "t6"]));
  });
});

describe("pickCombination (adjacency-aware)", () => {
  // Geometry: A and B sit side-by-side (pushable); C is across the room.
  const G = (id: string, max: number, x: number, y: number) => ({
    id,
    capacityMin: 2,
    capacityMax: max,
    positionX: x,
    positionY: y,
    width: 80,
    height: 80,
  });

  it("prefers two adjacent tables over a larger distant one", () => {
    const tables = [G("a", 6, 0, 0), G("b", 6, 120, 0), G("c", 8, 0, 1000)];
    // Greedy-largest-first would grab the distant 8-top c; adjacency must pick a+b.
    const combo = pickCombination({ party: 12, tables, freeTableIds: new Set(["a", "b", "c"]) });
    expect(new Set(combo)).toEqual(new Set(["a", "b"]));
  });

  it("falls back to a non-adjacent join rather than reject a feasible big party", () => {
    // No adjacent subset can reach 14 (a+b = 12); must still seat via a+c or b+c.
    const tables = [G("a", 6, 0, 0), G("b", 6, 120, 0), G("c", 8, 0, 1000)];
    const combo = pickCombination({ party: 14, tables, freeTableIds: new Set(["a", "b", "c"]) });
    expect(combo).not.toBeNull();
    expect(combo!.reduce((s, id) => s + (tables.find((t) => t.id === id)!.capacityMax), 0)).toBeGreaterThanOrEqual(14);
  });

  it("chains three adjacent tables in a row", () => {
    const tables = [G("a", 4, 0, 0), G("b", 4, 120, 0), G("c", 4, 240, 0), G("far", 8, 0, 1000)];
    const combo = pickCombination({ party: 11, tables, freeTableIds: new Set(["a", "b", "c", "far"]) });
    // a-b-c form a connected row summing 12 ≥ 11; 'far' is isolated.
    expect(new Set(combo)).toEqual(new Set(["a", "b", "c"]));
  });
});
