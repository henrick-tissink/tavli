/**
 * @jest-environment node
 *
 * Bootstrap calls createQueue twice per JOBS key (main + DLQ) with the
 * spec-mandated retry/expire/deadLetter config. Tested via a mock boss
 * so we don't need a real Postgres.
 */

import type PgBoss from "pg-boss";
import { JOBS } from "../keys";
import { _allJobNames, bootstrapQueues, dlqName } from "../bootstrap";

function makeMockBoss() {
  const createQueue = jest.fn().mockResolvedValue(undefined);
  return {
    boss: { createQueue } as unknown as PgBoss,
    createQueue,
  };
}

describe("bootstrapQueues", () => {
  it("creates a main queue + DLQ for every JOBS key", async () => {
    const { boss, createQueue } = makeMockBoss();
    const names = _allJobNames();
    expect(names.length).toBeGreaterThan(0);

    await bootstrapQueues(boss);

    // 2 calls per job (DLQ first, then main)
    expect(createQueue).toHaveBeenCalledTimes(names.length * 2);

    for (const name of names) {
      expect(createQueue).toHaveBeenCalledWith(dlqName(name));
      expect(createQueue).toHaveBeenCalledWith(
        name,
        expect.objectContaining({
          name,
          retryLimit: 3,
          retryBackoff: true,
          retryDelay: 60,
          expireInMinutes: 10,
          deadLetter: dlqName(name),
        }),
      );
    }
  });

  it("flattens every domain bucket in JOBS (no values missed)", () => {
    const names = new Set(_allJobNames());
    for (const domain of Object.values(JOBS)) {
      for (const value of Object.values(domain as Record<string, string>)) {
        expect(names.has(value)).toBe(true);
      }
    }
  });

  it("creates DLQ before main so deadLetter target exists", async () => {
    const { boss, createQueue } = makeMockBoss();
    await bootstrapQueues(boss);

    // For any JOBS key, the DLQ's createQueue call index < main's index.
    const calls = createQueue.mock.calls;
    for (const name of _allJobNames()) {
      const dlqIdx = calls.findIndex((c) => c[0] === dlqName(name) && c[1] === undefined);
      const mainIdx = calls.findIndex(
        (c) =>
          c[0] === name &&
          c[1] &&
          (c[1] as { deadLetter?: string }).deadLetter === dlqName(name),
      );
      expect(dlqIdx).toBeGreaterThanOrEqual(0);
      expect(mainIdx).toBeGreaterThan(dlqIdx);
    }
  });
});
