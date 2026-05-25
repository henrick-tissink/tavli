/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({
  organizations: { id: "o.id", status: "o.status", createdAt: "o.createdAt" },
  restaurants: { organizationId: "r.org", status: "r.status" },
  subscriptions: { id: "s.id", organizationId: "s.org" },
}));
jest.mock("drizzle-orm", () => ({
  and: jest.fn((...xs) => ({ and: xs })),
  eq: jest.fn((a, b) => ({ eq: [a, b] })),
  isNull: jest.fn((a) => ({ isNull: a })),
  lt: jest.fn((a, b) => ({ lt: [a, b] })),
}));
jest.mock("@/lib/audit/actions", () => ({
  AUDIT: { compliance: { retention_purge_run: "compliance.retention_purge_run" } },
}));

import { makePurgeStaleUnverifiedOrgs } from "../purge-stale-unverified-orgs";

function makeDb(stale: { id: string; createdAt: Date }[]) {
  const deletes: { table: unknown; where: unknown }[] = [];
  const db = {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => Promise.resolve(stale),
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: (w: unknown) => {
        deletes.push({ table, where: w });
        return Promise.resolve(undefined);
      },
    }),
  };
  return { db, deletes };
}

describe("purgeStaleUnverifiedOrgs", () => {
  it("deletes draft restaurants then the org, audits each, returns the count", async () => {
    const { db, deletes } = makeDb([
      { id: "org-1", createdAt: new Date("2026-01-01") },
      { id: "org-2", createdAt: new Date("2026-01-02") },
    ]);
    const recordAudit = jest.fn(async () => {});
    const n = await makePurgeStaleUnverifiedOrgs({ db, recordAudit } as never)();

    expect(n).toBe(2);
    // 2 deletes per org (restaurants, then org)
    expect(deletes).toHaveLength(4);
    // audit recorded before the delete, once per org
    expect(recordAudit).toHaveBeenCalledTimes(2);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "compliance.retention_purge_run",
        actorRole: "system",
        subjectId: "org-1",
      }),
    );
  });

  it("continues the batch when one org fails to purge", async () => {
    const { db } = makeDb([
      { id: "org-1", createdAt: new Date("2026-01-01") },
      { id: "org-2", createdAt: new Date("2026-01-02") },
    ]);
    let calls = 0;
    db.delete = (() => ({
      where: () => {
        calls++;
        if (calls === 1) return Promise.reject(new Error("restrict"));
        return Promise.resolve(undefined);
      },
    })) as never;
    const recordAudit = jest.fn(async () => {});
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const n = await makePurgeStaleUnverifiedOrgs({ db, recordAudit } as never)();
    // org-1's first delete rejects → it's skipped; org-2 succeeds.
    expect(n).toBe(1);
    spy.mockRestore();
  });

  it("returns 0 when no orgs are stale", async () => {
    const { db, deletes } = makeDb([]);
    const recordAudit = jest.fn(async () => {});
    const n = await makePurgeStaleUnverifiedOrgs({ db, recordAudit } as never)();
    expect(n).toBe(0);
    expect(deletes).toHaveLength(0);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
