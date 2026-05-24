import { makeHandleEventRequests } from "../event-requests";
import type { HandlerDeps } from "../../pii-table-registry";

function depsWith(
  ids: Array<{ email: string | null; phone: string | null }>,
): Omit<HandlerDeps, "db"> {
  return {
    dsrId: "11111111-1111-1111-1111-111111111111",
    dinerIds: [],
    capturedIdentifiers: ids.map((x, i) => ({ dinerId: `d${i}`, ...x })),
    actorUserId: "admin",
    impersonatorUserId: undefined,
    actorRole: "tavli_admin",
  };
}

describe("handleEventRequests", () => {
  it("redacts guest PII for rows matching a captured email or phone", async () => {
    let setValues: any = null;
    const db = {
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((v) => {
          setValues = v;
          return { where: jest.fn().mockResolvedValue({ rowCount: 2 }) };
        }),
      }),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandleEventRequests({});
    const result = await handler({
      db,
      ...depsWith([{ email: "Guest@Example.com", phone: "+40700111222" }]),
    });

    expect(result.tableName).toBe("event_requests");
    expect(result.rowsRedacted).toBe(2);
    expect(setValues.guestEmail).not.toBe("Guest@Example.com");
    expect(setValues.guestPhone).toBeNull();
    expect(setValues.dietaryNotes).toBeNull();
    expect(setValues.additionalNotes).toBeNull();
    expect(setValues.redactedAt).toBeInstanceOf(Date);
  });

  it("skips when there are no captured email/phone identifiers", async () => {
    const db = { update: jest.fn() } as unknown as HandlerDeps["db"];
    const handler = makeHandleEventRequests({});
    const result = await handler({
      db,
      ...depsWith([{ email: null, phone: null }]),
    });
    expect(result.rowsRedacted).toBe(0);
    expect(result.skipped).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });
});
