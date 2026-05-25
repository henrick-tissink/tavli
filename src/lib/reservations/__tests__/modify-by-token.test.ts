/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("drizzle-orm", () => ({ sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ __sql: s.join("?"), v }) }));

import { makeModifyReservationByToken } from "../modify-by-token";

const NOW = new Date("2026-05-25T12:00:00Z");
// Far-future slot (well beyond the 24h cutoff).
const FAR = "2026-06-10T18:00:00Z";

function makeDeps(opts: { row?: Record<string, unknown> | null; updated?: unknown[]; throwOnUpdate?: string } = {}) {
  const row = "row" in opts ? opts.row : { id: "res-1", status: "confirmed", version: 0, restaurant_id: "rest-1", slot_at: FAR };
  const db = {
    execute: jest.fn(async (q: unknown) => {
      const t = JSON.stringify(q);
      if (t.includes("FROM reservations r JOIN restaurants")) return row ? [row] : [];
      if (t.includes("UPDATE reservations")) {
        if (opts.throwOnUpdate) throw new Error(opts.throwOnUpdate);
        return opts.updated ?? [{ id: "res-1" }];
      }
      return [];
    }),
  };
  const recordAudit = jest.fn(async (_i: { action: string }) => {});
  return { db, recordAudit, now: () => NOW };
}

describe("modifyReservationByToken (F14)", () => {
  it("modifies a confirmed reservation > 24h out + audits + bumps version", async () => {
    const d = makeDeps();
    const r = await makeModifyReservationByToken(d as never)({ token: "t", version: 0, date: "2026-06-11", time: "19:00", partySize: 4 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.version).toBe(1);
    expect((d.recordAudit.mock.calls[0][0] as { action: string }).action).toBe("reservation.modified");
  });

  it("TV007 when the reservation is not confirmed", async () => {
    const d = makeDeps({ row: { id: "res-1", status: "cancelled", version: 0, restaurant_id: "rest-1", slot_at: FAR } });
    const r = await makeModifyReservationByToken(d as never)({ token: "t", version: 0, date: "2026-06-11", time: "19:00", partySize: 4 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("TV007");
  });

  it("TV003 within 24h of the slot", async () => {
    const d = makeDeps({ row: { id: "res-1", status: "confirmed", version: 0, restaurant_id: "rest-1", slot_at: "2026-05-25T20:00:00Z" } });
    const r = await makeModifyReservationByToken(d as never)({ token: "t", version: 0, date: "2026-05-26", time: "19:00", partySize: 4 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("TV003");
  });

  it("conflict on a stale version (0-row update)", async () => {
    const d = makeDeps({ updated: [] });
    const r = await makeModifyReservationByToken(d as never)({ token: "t", version: 5, date: "2026-06-11", time: "19:00", partySize: 4 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("conflict");
  });

  it("maps a capacity-trigger TV002 to slot_full conflict", async () => {
    const d = makeDeps({ throwOnUpdate: "Slot is full" });
    const r = await makeModifyReservationByToken(d as never)({ token: "t", version: 0, date: "2026-06-11", time: "19:00", partySize: 9 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("TV002");
  });
});
