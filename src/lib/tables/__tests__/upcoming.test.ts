import { reservationsByTable } from "../upcoming";

const R = (over: Partial<Parameters<typeof reservationsByTable>[0][number]>) => ({
  id: "r", guestName: "G", partySize: 2, time: "19:00", tableId: null, combinationId: null, ...over,
});

describe("reservationsByTable", () => {
  it("maps a single-table reservation to its table", () => {
    const m = reservationsByTable([R({ id: "a", tableId: "t1", time: "19:00" })], new Map());
    expect(m.get("t1")).toEqual([{ id: "a", guestName: "G", partySize: 2, time: "19:00" }]);
    expect(m.has("t2")).toBe(false);
  });

  it("attributes a combination booking to every member table", () => {
    const m = reservationsByTable(
      [R({ id: "big", combinationId: "c1", partySize: 12, time: "20:00" })],
      new Map([["c1", ["t3", "t5"]]]),
    );
    expect(m.get("t3")?.[0]).toMatchObject({ id: "big", partySize: 12 });
    expect(m.get("t5")?.[0]).toMatchObject({ id: "big", partySize: 12 });
  });

  it("sorts each table's reservations by time", () => {
    const m = reservationsByTable(
      [
        R({ id: "late", tableId: "t1", time: "21:00" }),
        R({ id: "early", tableId: "t1", time: "18:30" }),
      ],
      new Map(),
    );
    expect(m.get("t1")!.map((r) => r.id)).toEqual(["early", "late"]);
  });

  it("ignores reservations that occupy no table", () => {
    const m = reservationsByTable([R({ id: "x", tableId: null, combinationId: null })], new Map());
    expect(m.size).toBe(0);
  });
});
