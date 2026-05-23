import { makeHandlePartnerNotificationsPhase1 } from "../partner-notifications-phase1";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handlePartnerNotificationsPhase1", () => {
  it("marks pending_erasure_at on matching notifications + writes erasure_log entries", async () => {
    const execute = jest.fn().mockResolvedValue([{ id: "pn-1" }, { id: "pn-2" }]);
    const insertValues = jest.fn().mockResolvedValue([]);
    const db = {
      execute,
      insert: jest.fn().mockReturnValue({ values: insertValues }),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandlePartnerNotificationsPhase1({});
    const result = await handler({
      db,
      dsrId: "11111111-1111-1111-1111-111111111111",
      dinerIds: ["d1"],
      capturedIdentifiers: [],
      actorUserId: "admin",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });

    expect(result.tableName).toBe("partner_notifications");
    expect(result.rowsRedacted).toBe(2);
    expect(insertValues).toHaveBeenCalledTimes(1);
    const insertedRows = insertValues.mock.calls[0][0];
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows.every((r: any) => r.subjectType === "partner_notification")).toBe(true);
    expect(insertedRows.every((r: any) => r.reason === "gdpr_art_17")).toBe(true);
    expect(insertedRows.every((r: any) => (r.context as any).phase === 1)).toBe(true);
  });

  it("is a no-op (zero rows redacted) when dinerIds is empty", async () => {
    const db = { execute: jest.fn(), insert: jest.fn() } as unknown as HandlerDeps["db"];
    const handler = makeHandlePartnerNotificationsPhase1({});
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

  it("returns rowsRedacted=0 + skipped=true when no notifications match", async () => {
    const db = {
      execute: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
    } as unknown as HandlerDeps["db"];
    const handler = makeHandlePartnerNotificationsPhase1({});
    const result = await handler({
      db,
      dsrId: "11111111-1111-1111-1111-111111111111",
      dinerIds: ["d1"],
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
