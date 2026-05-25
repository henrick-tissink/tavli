/**
 * @jest-environment node
 *
 * Unit tests for the three diner pg-boss handlers — Wave 3 §03 §5.3 / §8.2
 * sub-unit D.4. Drives a mocked Drizzle service-role client to verify the
 * recompute path, the rebalance SQL execute, and the purge → audit-per-row
 * shape.
 */

jest.mock("@/lib/audit/record", () => ({
  recordAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/db/admin", () => ({
  dbAdmin: {},
  createSupabaseAdminClient: jest.fn(),
}));

// Avoid pulling pg-boss at import time (the singleton handlers wire the real
// enqueue); the DI'd handlers under test receive their own enqueue mock.
jest.mock("@/lib/jobs/enqueue", () => ({ enqueue: jest.fn() }));
jest.mock("@/lib/jobs/keys", () => ({
  JOBS: { marketing: { fireTriggeredCampaign: "marketing.fire-triggered-campaign" } },
}));

import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import {
  makeHandleRecomputeDinerAggregates,
  makeHandleFrequencyBucketRebalance,
  makeHandleLapsedScan,
  makeHandleBirthdayScan,
  makeHandlePurgePseudonymised,
} from "../../handlers/diners";

beforeEach(() => {
  (recordAudit as jest.Mock).mockClear();
});

describe("handleRecomputeDinerAggregates", () => {
  it("recomputes visit_count + last_visited_at from reservations scan", async () => {
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const update = jest.fn().mockReturnValue({ set: updateSet });

    const lastVisited = new Date("2026-04-12T19:30:00.000Z");
    const where = jest.fn().mockResolvedValue([
      { count: 7, lastVisited },
    ]);
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });

    const db = { select, update };
    const fn = makeHandleRecomputeDinerAggregates({ db: db as never });
    await fn({ dinerId: "diner-1" });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        visitCount: 7,
        lastVisitedAt: lastVisited,
      }),
    );
  });

  it("handles a diner with zero reservations gracefully (count=0, lastVisited=null)", async () => {
    const updateWhere = jest.fn().mockResolvedValue(undefined);
    const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
    const update = jest.fn().mockReturnValue({ set: updateSet });

    const where = jest.fn().mockResolvedValue([
      { count: 0, lastVisited: null },
    ]);
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });

    const db = { select, update };
    const fn = makeHandleRecomputeDinerAggregates({ db: db as never });
    await fn({ dinerId: "diner-1" });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        visitCount: 0,
        lastVisitedAt: null,
      }),
    );
  });

  it("no-ops when select returns no rows (defensive guard)", async () => {
    const update = jest.fn();
    const where = jest.fn().mockResolvedValue([]);
    const from = jest.fn().mockReturnValue({ where });
    const select = jest.fn().mockReturnValue({ from });

    const db = { select, update };
    const fn = makeHandleRecomputeDinerAggregates({ db: db as never });
    await fn({ dinerId: "diner-1" });

    expect(update).not.toHaveBeenCalled();
  });
});

describe("handleFrequencyBucketRebalance", () => {
  it("issues a single bulk UPDATE skipping pseudonymised rows", async () => {
    const execute = jest.fn().mockResolvedValue(undefined);
    const db = { execute };
    const fn = makeHandleFrequencyBucketRebalance({ db: db as never });
    await fn();

    expect(execute).toHaveBeenCalledTimes(1);
    // Inspect the SQL fragment passed in — drizzle's sql template builds
    // an object; we stringify to verify the CASE shape + WHERE guard.
    const arg = (execute.mock.calls[0][0] as { queryChunks: unknown[] })
      .queryChunks;
    const flat = JSON.stringify(arg);
    expect(flat).toContain("frequency_bucket");
    expect(flat).toContain("'vip'");
    expect(flat).toContain("'regular'");
    expect(flat).toContain("'occasional'");
    expect(flat).toContain("'first_timer'");
    expect(flat).toContain("redacted_at IS NULL");
  });
});

describe("handleLapsedScan", () => {
  it("enqueues diner.lapsed_60d for each 60-day-boundary diner with a dedup singletonKey", async () => {
    const execute = jest.fn().mockResolvedValue([
      { id: "d1", organization_id: "o1" },
      { id: "d2", organization_id: "o2" },
    ]);
    const enqueue = jest.fn().mockResolvedValue("j");
    const fn = makeHandleLapsedScan({ db: { execute } as never, enqueue: enqueue as never });
    await fn();

    expect(enqueue).toHaveBeenCalledTimes(2);
    const [key, payload, opts] = enqueue.mock.calls[0];
    expect(key).toBe("marketing.fire-triggered-campaign");
    expect(payload).toMatchObject({
      triggerEvent: "diner.lapsed_60d",
      dinerId: "d1",
      organizationId: "o1",
      restaurantId: null,
    });
    expect((opts as { singletonKey: string }).singletonKey).toMatch(/^trig:diner\.lapsed_60d:d1:/);
  });

  it("no-ops when no diners cross the boundary", async () => {
    const execute = jest.fn().mockResolvedValue([]);
    const enqueue = jest.fn();
    const fn = makeHandleLapsedScan({ db: { execute } as never, enqueue: enqueue as never });
    await fn();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("handleBirthdayScan", () => {
  it("enqueues diner.birthday for each diner 7 days out, with a per-year dedup key", async () => {
    const execute = jest.fn().mockResolvedValue([{ id: "d1", organization_id: "o1" }]);
    const enqueue = jest.fn().mockResolvedValue("j");
    const fn = makeHandleBirthdayScan({ db: { execute } as never, enqueue: enqueue as never });
    await fn();

    expect(enqueue).toHaveBeenCalledTimes(1);
    const [key, payload, opts] = enqueue.mock.calls[0];
    expect(key).toBe("marketing.fire-triggered-campaign");
    expect(payload).toMatchObject({ triggerEvent: "diner.birthday", dinerId: "d1", organizationId: "o1", restaurantId: null });
    expect((opts as { singletonKey: string }).singletonKey).toMatch(/^trig:diner\.birthday:d1:\d{4}$/);
  });

  it("no-ops when no birthdays are 7 days out", async () => {
    const execute = jest.fn().mockResolvedValue([]);
    const enqueue = jest.fn();
    const fn = makeHandleBirthdayScan({ db: { execute } as never, enqueue: enqueue as never });
    await fn();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("handlePurgePseudonymised", () => {
  it("deletes diners with redacted_at older than 30 days and writes one audit row per deletion", async () => {
    const returning = jest
      .fn()
      .mockResolvedValue([{ id: "diner-old-1" }, { id: "diner-old-2" }]);
    const where = jest.fn().mockReturnValue({ returning });
    const del = jest.fn().mockReturnValue({ where });
    const db = { delete: del };

    const fn = makeHandlePurgePseudonymised({ db: db as never });
    await fn();

    expect(del).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledTimes(2);
    expect((recordAudit as jest.Mock).mock.calls[0][0]).toMatchObject({
      action: AUDIT.diner.deleted,
      subjectType: "diner",
      subjectId: "diner-old-1",
      actorUserId: null,
      actorRole: "system",
      context: { reason: "auto_purge_pseudonymised_30d" },
    });
    expect((recordAudit as jest.Mock).mock.calls[1][0]).toMatchObject({
      subjectId: "diner-old-2",
    });
  });

  it("no-ops cleanly when no rows are eligible for purge", async () => {
    const returning = jest.fn().mockResolvedValue([]);
    const where = jest.fn().mockReturnValue({ returning });
    const del = jest.fn().mockReturnValue({ where });
    const db = { delete: del };

    const fn = makeHandlePurgePseudonymised({ db: db as never });
    await fn();

    expect(del).toHaveBeenCalledTimes(1);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
