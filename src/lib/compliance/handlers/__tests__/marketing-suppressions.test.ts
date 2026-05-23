import { makeHandleMarketingSuppressions } from "../marketing-suppressions";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handleMarketingSuppressions", () => {
  it("inserts sms + email suppression rows for each (channel, identifier) pair from captured identifiers", async () => {
    const inserts: any[] = [];
    const onConflict = jest.fn().mockResolvedValue({ rowCount: undefined });
    const db = {
      insert: jest.fn().mockImplementation(() => ({
        values: jest.fn().mockImplementation((rows) => {
          inserts.push(...(Array.isArray(rows) ? rows : [rows]));
          return { onConflictDoNothing: onConflict };
        }),
      })),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandleMarketingSuppressions({});
    const result = await handler({
      db,
      dsrId: "11111111-1111-1111-1111-111111111111",
      dinerIds: ["d1"],
      capturedIdentifiers: [
        { dinerId: "d1", phone: "+40712345678", email: "alice@example.ro" },
      ],
      actorUserId: "admin-1",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });

    expect(result.tableName).toBe("marketing_suppressions");
    expect(inserts).toHaveLength(2);
    expect(inserts.map((r) => r.channel).sort()).toEqual(["email", "sms"]);
    expect(inserts.find((r) => r.channel === "email").identifier).toBe("alice@example.ro");
    expect(inserts.find((r) => r.channel === "sms").identifier).toBe("+40712345678");
    expect(inserts.every((r) => r.source === "gdpr_erasure")).toBe(true);
    expect(inserts.every((r) => r.reason === "dsr:11111111-1111-1111-1111-111111111111")).toBe(true);
    expect(onConflict).toHaveBeenCalled();
  });

  it("skips channels whose identifier is null", async () => {
    const inserts: any[] = [];
    const db = {
      insert: jest.fn().mockImplementation(() => ({
        values: jest.fn().mockImplementation((rows) => {
          inserts.push(...(Array.isArray(rows) ? rows : [rows]));
          return { onConflictDoNothing: jest.fn().mockResolvedValue({ rowCount: undefined }) };
        }),
      })),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandleMarketingSuppressions({});
    await handler({
      db,
      dsrId: "11111111-1111-1111-1111-111111111111",
      dinerIds: ["d1"],
      capturedIdentifiers: [{ dinerId: "d1", phone: null, email: "alice@example.ro" }],
      actorUserId: "admin-1",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].channel).toBe("email");
  });

  it("returns rowsRedacted=0 + skipped=true when capturedIdentifiers is empty", async () => {
    const db = { insert: jest.fn() } as unknown as HandlerDeps["db"];
    const handler = makeHandleMarketingSuppressions({});
    const result = await handler({
      db,
      dsrId: "11111111-1111-1111-1111-111111111111",
      dinerIds: [],
      capturedIdentifiers: [],
      actorUserId: "admin-1",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });
    expect(result.rowsRedacted).toBe(0);
    expect(result.skipped).toBe(true);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
