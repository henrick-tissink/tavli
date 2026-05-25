/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({
  restaurantTables: {
    currentStatus: "t.status",
    currentStatusSince: "t.since",
    restaurantId: "t.rid",
    capacityMin: "t.cmin",
    capacityMax: "t.cmax",
    archivedAt: "t.arch",
  },
  restaurants: { id: "r.id", turnTimeMinutes: "r.turn" },
  walkinQueue: { id: "w.id", restaurantId: "w.rid", status: "w.status", position: "w.pos" },
}));
jest.mock("drizzle-orm", () => ({
  and: jest.fn((...a) => ({ and: a })),
  eq: jest.fn((a, b) => ({ eq: [a, b] })),
  inArray: jest.fn((a, b) => ({ inArray: [a, b] })),
  sql: Object.assign((s: TemplateStringsArray) => ({ sql: s.join("") }), { raw: (t: string) => t }),
}));
jest.mock("../transitions", () => ({ transitionTableStatus: jest.fn() }));

import { makeWalkinQueue } from "../walkin";
import { transitionTableStatus } from "../transitions";

const NOW = new Date("2026-05-25T20:00:00Z");

// db whose select() resolves a queued sequence of results (turn row, then
// candidates, then max-position).
function makeDb(seq: unknown[][]) {
  const q = [...seq];
  const builder = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "orderBy"]) b[m] = () => b;
    (b as { then: unknown }).then = (res: (v: unknown) => unknown) => res(q.shift() ?? []);
    return b;
  };
  return {
    select: jest.fn(builder),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ id: "w-new" }]) })),
    })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
  };
}

describe("estimateWait", () => {
  it("returns ~5 min + a free count when a free candidate exists", async () => {
    const db = makeDb([
      [{ turn: 90 }], // restaurant turn time
      [
        { currentStatus: "free", currentStatusSince: NOW },
        { currentStatus: "seated", currentStatusSince: NOW },
      ],
    ]);
    const ops = makeWalkinQueue({ db: db as never, now: () => NOW });
    const est = await ops.estimateWait({ restaurantId: "r1", partySize: 2 });
    expect(est).toEqual({ estimatedWaitMinutes: 5, freeCount: 1, canSeat: true });
  });

  it("projects turn-time when all candidates are seated", async () => {
    const since = new Date(NOW.getTime() - 60 * 60_000); // seated 60m ago, 90m turn → 30m left
    const db = makeDb([[{ turn: 90 }], [{ currentStatus: "seated", currentStatusSince: since }]]);
    const ops = makeWalkinQueue({ db: db as never, now: () => NOW });
    const est = await ops.estimateWait({ restaurantId: "r1", partySize: 2 });
    expect(est.canSeat).toBe(true);
    expect(est.freeCount).toBe(0);
    expect(est.estimatedWaitMinutes).toBe(30);
  });

  it("returns canSeat:false when no table fits the party size", async () => {
    const db = makeDb([[{ turn: 90 }], []]);
    const ops = makeWalkinQueue({ db: db as never, now: () => NOW });
    const est = await ops.estimateWait({ restaurantId: "r1", partySize: 20 });
    expect(est).toEqual({ estimatedWaitMinutes: null, freeCount: 0, canSeat: false });
  });
});

describe("addWalkin", () => {
  it("assigns the next queue position + stores the estimate", async () => {
    const db = makeDb([
      [{ turn: 90 }], // estimate: turn
      [{ currentStatus: "free", currentStatusSince: NOW }], // estimate: candidates
      [{ max: 2 }], // current max position
    ]);
    const ops = makeWalkinQueue({ db: db as never, now: () => NOW });
    const res = await ops.addWalkin({ restaurantId: "r1", guestName: "Ana", partySize: 2, addedByUserId: "u1" });
    expect(res.position).toBe(3);
    expect(res.estimatedWaitMinutes).toBe(5);
    expect(res.id).toBe("w-new");
  });
});

describe("seatWalkin", () => {
  it("transitions the chosen table to seated then marks the walk-in seated", async () => {
    const db = makeDb([]);
    const ops = makeWalkinQueue({ db: db as never, now: () => NOW });
    await ops.seatWalkin({ walkinId: "w1", tableId: "t1", changedByUserId: "u1" });
    expect(transitionTableStatus).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: "t1", toStatus: "seated" }),
    );
    expect(db.update).toHaveBeenCalled();
  });
});
