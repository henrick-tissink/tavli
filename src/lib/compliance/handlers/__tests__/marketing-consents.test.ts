import { makeHandleMarketingConsents } from "../marketing-consents";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handleMarketingConsents", () => {
  it("sets revoked_at on all active consent rows for the diner_ids", async () => {
    let setValues: any = null;
    const db = {
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((v) => {
          setValues = v;
          return { where: jest.fn().mockResolvedValue({ rowCount: 2 }) };
        }),
      }),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandleMarketingConsents({});
    const result = await handler({
      db,
      dsrId: "11111111-1111-1111-1111-111111111111",
      dinerIds: ["d1", "d2"],
      capturedIdentifiers: [],
      actorUserId: "admin",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });

    expect(result.tableName).toBe("marketing_consents");
    expect(result.rowsRedacted).toBe(2);
    expect(setValues.revokedAt).toBeInstanceOf(Date);
  });

  it("returns rowsRedacted=0 + skipped=true when dinerIds is empty", async () => {
    const db = { update: jest.fn() } as unknown as HandlerDeps["db"];
    const handler = makeHandleMarketingConsents({});
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
    expect(db.update).not.toHaveBeenCalled();
  });
});
