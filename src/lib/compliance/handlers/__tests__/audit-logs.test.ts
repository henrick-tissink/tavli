import { makeHandleAuditLogs } from "../audit-logs";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handleAuditLogs", () => {
  it("runs both passes (diner + reservation subject_types) and inserts erasure_log per chunk", async () => {
    let executeCallCount = 0;
    const sqlInvocations: string[] = [];
    const erasureLogInserts: any[][] = [];

    const db = {
      execute: jest.fn().mockImplementation((q) => {
        executeCallCount += 1;
        const qStr = JSON.stringify(q);
        sqlInvocations.push(qStr);
        // Each pass returns one chunk of 2 rows, then 0 rows.
        if (executeCallCount === 1 || executeCallCount === 3) {
          return Promise.resolve([{ id: "row-a" }, { id: "row-b" }]);
        }
        return Promise.resolve([]);
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockImplementation((rows) => {
          erasureLogInserts.push(rows);
          return Promise.resolve([]);
        }),
      }),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandleAuditLogs({});
    const result = await handler({
      db,
      dsrId: "11111111-1111-1111-1111-111111111111",
      dinerIds: ["d1"],
      capturedIdentifiers: [],
      actorUserId: "admin",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });

    expect(result.tableName).toBe("audit_logs");
    expect(result.rowsRedacted).toBe(4); // 2 rows × 2 passes
    expect(erasureLogInserts).toHaveLength(2);
    expect(erasureLogInserts[0]).toHaveLength(2);
    expect(erasureLogInserts[0][0].subjectType).toBe("audit_log");
    expect(erasureLogInserts[0][0].reason).toBe("gdpr_art_17");
    expect(erasureLogInserts[0][0].context.dsrId).toBe("11111111-1111-1111-1111-111111111111");
    // Both pass predicates appear across the SQL invocations
    const allSql = sqlInvocations.join("|");
    expect(allSql).toContain("'diner'");
    expect(allSql).toContain("'reservation'");
  });

  it("returns rowsRedacted=0 + skipped=true when dinerIds is empty", async () => {
    const db = { execute: jest.fn(), insert: jest.fn() } as unknown as HandlerDeps["db"];
    const handler = makeHandleAuditLogs({});
    const result = await handler({
      db,
      dsrId: "11111111-1111-1111-1111-111111111111",
      dinerIds: [],
      capturedIdentifiers: [],
      actorUserId: "admin",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });
    expect(result.rowsRedacted).toBe(0);
    expect(result.skipped).toBe(true);
    expect(db.execute).not.toHaveBeenCalled();
  });
});
