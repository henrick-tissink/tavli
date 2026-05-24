/**
 * @jest-environment node
 */
import { makeRunMigrationImport } from "@/lib/migration/run-import";

const HEADER = "reservation_date,reservation_time,party_size,guest_name,guest_phone,guest_email,notes,status";
// Two valid rows; the second duplicates an existing reservation (same 4-tuple).
const CSV = `${HEADER}
2020-05-01,19:00,4,Ana Pop,+40712345678,,,
2020-05-02,20:00,2,Ben Ide,+40700000000,,,`;

function harness() {
  let call = 0;
  const inserts: unknown[] = [];
  const db = {
    execute: jest.fn(async (q: unknown) => {
      call++;
      const t = JSON.stringify(q);
      if (t.includes("FROM migration_imports")) return [{ restaurant_id: "r1", source_file_storage_path: "p/x.csv" }];
      if (t.includes("FROM reservations") && t.includes("guest_phone IS NOT NULL")) {
        // existing reservation that dups row 2 (Ben, +40700000000, 2020-05-02 20:00, 2)
        return [{ d: "2020-05-02", t: "20:00:00", p: "+40700000000", ps: 2 }];
      }
      if (t.includes("INSERT INTO reservations")) inserts.push(q);
      return [];
    }),
  };
  const loadCsv = jest.fn(async () => CSV);
  const findOrCreateDiner = jest.fn(async () => ({ dinerId: "d1", created: true }));
  const recordAudit = jest.fn(async (_i: { action: string; context?: Record<string, number> }) => {});
  return { db, loadCsv, findOrCreateDiner, recordAudit, inserts, run: makeRunMigrationImport({ db: db as never, loadCsv, findOrCreateDiner, recordAudit: recordAudit as never, now: () => new Date("2026-05-24T00:00:00Z") }) };
}

describe("makeRunMigrationImport", () => {
  test("imports the non-duplicate row, skips the duplicate, audits counts", async () => {
    const h = harness();
    await h.run({ importId: "imp1" });
    // Only row 1 inserted (row 2 is a dup of the existing reservation).
    expect(h.inserts).toHaveLength(1);
    expect(h.findOrCreateDiner).toHaveBeenCalledTimes(1);
    const audit = h.recordAudit.mock.calls[0][0];
    expect(audit.action).toBe("setup.migration_completed");
    expect(audit.context).toMatchObject({ reservations_imported: 1, reservations_skipped: 1 });
  });

  test("no-op when the import row is missing", async () => {
    const db = { execute: jest.fn(async () => []) };
    const run = makeRunMigrationImport({ db: db as never, loadCsv: jest.fn(), findOrCreateDiner: jest.fn(), recordAudit: jest.fn() as never });
    await run({ importId: "missing" });
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});
