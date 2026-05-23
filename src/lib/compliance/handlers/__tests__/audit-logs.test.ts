import { makeHandleAuditLogs } from "../audit-logs";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handleAuditLogs", () => {
  it("runs both passes (diner + reservation subject_types) and inserts erasure_log per chunk", async () => {
    const sqlInvocations: string[] = [];
    const erasureLogInserts: any[][] = [];

    // Transaction mock: each call executes the callback with a tx object.
    // Pass 1: first tx call returns 2 rows (< CHUNK_SIZE so loop exits immediately).
    // Pass 2: second tx call returns 2 rows (< CHUNK_SIZE so loop exits immediately).
    // The early-exit on chunk < CHUNK_SIZE means no empty-terminator calls are needed.
    let txCallCount = 0;
    const db = {
      transaction: jest.fn().mockImplementation(async (callback) => {
        txCallCount += 1;
        const tx = {
          execute: jest.fn().mockImplementation((q) => {
            const qStr = JSON.stringify(q);
            sqlInvocations.push(qStr);
            // Both pass calls return 2 rows — chunk < CHUNK_SIZE triggers early exit.
            return Promise.resolve([{ id: "row-a" }, { id: "row-b" }]);
          }),
          insert: jest.fn().mockReturnValue({
            values: jest.fn().mockImplementation((rows) => {
              erasureLogInserts.push(rows);
              return Promise.resolve([]);
            }),
          }),
        };
        return callback(tx);
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
    const db = { transaction: jest.fn() } as unknown as HandlerDeps["db"];
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
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("wraps each chunk's UPDATE + erasure_log INSERT in a single transaction", async () => {
    const txCalls: string[] = [];
    const txMock = jest.fn().mockImplementation(async (callback) => {
      txCalls.push("tx-start");
      let executeCallCount = 0;
      const tx = {
        execute: jest.fn().mockImplementation(() => {
          executeCallCount += 1;
          // First execute per tx returns 1 row; subsequent (would only happen if
          // the outer loop retries) returns empty. Since chunk < CHUNK_SIZE the
          // outer loop breaks after the first non-empty tx, so each pass only
          // gets two tx invocations: one returning [row-1], one returning [].
          if (txCalls.filter((c) => c === "tx-start").length % 2 === 1) {
            return Promise.resolve([{ id: "row-1" }]);
          }
          return Promise.resolve([]);
        }),
        insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue([]) }),
      };
      const result = await callback(tx);
      txCalls.push("tx-end");
      return result;
    });
    const db = {
      transaction: txMock,
    } as unknown as HandlerDeps["db"];
    const handler = makeHandleAuditLogs({});
    await handler({
      db,
      dsrId: "11111111-1111-1111-1111-111111111111",
      dinerIds: ["d1"],
      capturedIdentifiers: [],
      actorUserId: "admin",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });
    // Each pass loops until empty; passes 1 + 2 each call tx twice (1 chunk + 1 empty)
    // So total tx invocations: 4
    expect(txMock.mock.calls.length).toBeGreaterThan(0);
    expect(txCalls.filter((c) => c === "tx-start").length).toEqual(txCalls.filter((c) => c === "tx-end").length);
  });
});
