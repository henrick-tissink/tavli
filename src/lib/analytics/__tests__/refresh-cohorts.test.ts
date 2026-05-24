import { makeRefreshCohorts } from "@/lib/analytics/refresh-cohorts";

function fakeDb(orgs: Array<{ id: string }>, visitRows: Array<{ diner_id: string; visit_month: string }>) {
  let call = 0;
  const db = {
    execute: jest.fn(async () => {
      call++;
      if (call === 1) return orgs; // org selection
      if (call === 2) return visitRows; // per-org visit months
      return []; // upsert
    }),
  };
  return db;
}

describe("makeRefreshCohorts", () => {
  test("no orgs → only the selection query runs", async () => {
    const db = fakeDb([], []);
    await makeRefreshCohorts({ db: db as never, now: () => new Date("2026-05-15T00:00:00Z") })();
    expect(db.execute.mock.calls.length).toBe(1);
  });

  test("org with visits → selection + visit query + upsert", async () => {
    const db = fakeDb(
      [{ id: "org1" }],
      [
        { diner_id: "d1", visit_month: "2026-01-01" },
        { diner_id: "d1", visit_month: "2026-02-01" },
        { diner_id: "d2", visit_month: "2026-01-01" },
      ],
    );
    await makeRefreshCohorts({ db: db as never, now: () => new Date("2026-05-15T00:00:00Z") })();
    expect(db.execute.mock.calls.length).toBe(3);
  });

  test("org with no visits → no upsert", async () => {
    const db = fakeDb([{ id: "org1" }], []);
    await makeRefreshCohorts({ db: db as never, now: () => new Date("2026-05-15T00:00:00Z") })();
    expect(db.execute.mock.calls.length).toBe(2); // select orgs + select visits, no upsert
  });
});
