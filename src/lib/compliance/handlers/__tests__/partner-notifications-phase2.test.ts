import { makeHandlePartnerNotificationsPhase2, HARD_DELETE_ELIGIBLE_KINDS } from "../partner-notifications-phase2";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handlePartnerNotificationsPhase2", () => {
  it("hard-deletes eligible-kind old rows + payload-replaces the rest", async () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
    const calls: string[] = [];
    const erasureLogRows: any[] = [];
    const db = {
      execute: jest.fn().mockImplementation((q) => {
        calls.push("execute");
        const qStr = JSON.stringify(q);
        // First call: SELECT marked rows
        if (calls.filter((c) => c === "execute").length === 1) {
          return Promise.resolve([
            { id: "pn-1", kind: "reservation_created", created_at: oldDate },
            { id: "pn-2", kind: "quote_accepted", created_at: oldDate },
          ]);
        }
        // Subsequent calls (DELETE + UPDATE)
        if (qStr.includes("DELETE")) return Promise.resolve({ rowCount: 1 });
        if (qStr.includes("UPDATE")) return Promise.resolve({ rowCount: 1 });
        return Promise.resolve([]);
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockImplementation((rows) => {
          erasureLogRows.push(...rows);
          return Promise.resolve([]);
        }),
      }),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandlePartnerNotificationsPhase2({});
    const result = await handler({
      db,
      dsrId: "11111111-1111-1111-1111-111111111111",
      dinerIds: [],
      capturedIdentifiers: [],
      actorUserId: "admin",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });

    expect(result.tableName).toBe("partner_notifications");
    expect(result.rowsRedacted).toBe(2);
    expect(HARD_DELETE_ELIGIBLE_KINDS).toContain("reservation_created");
    expect(erasureLogRows).toHaveLength(2);
    expect(erasureLogRows.every((r) => r.subjectType === "partner_notification")).toBe(true);
    expect(erasureLogRows.every((r) => (r.context as any).phase === 2)).toBe(true);
    // pn-1 was deleted (eligible kind + old) — row_deleted marker
    const pn1Entry = erasureLogRows.find((r) => r.subjectId === "pn-1");
    expect(pn1Entry?.redactedColumns).toContain("row_deleted");
    // pn-2 was payload-replaced — payload marker
    const pn2Entry = erasureLogRows.find((r) => r.subjectId === "pn-2");
    expect(pn2Entry?.redactedColumns).toContain("payload");
  });

  it("is a no-op when no marked rows match the dsrId", async () => {
    const db = {
      execute: jest.fn().mockResolvedValueOnce([]),
      insert: jest.fn(),
    } as unknown as HandlerDeps["db"];
    const handler = makeHandlePartnerNotificationsPhase2({});
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
    expect(db.insert).not.toHaveBeenCalled();
  });
});
