import { makeHandleWalkinQueue } from "../walkin-queue";
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

describe("handleWalkinQueue", () => {
  it("redacts name/phone/notes for rows matching a captured phone", async () => {
    let setValues: Record<string, unknown> | null = null;
    const db = {
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((v) => {
          setValues = v;
          return { where: jest.fn().mockResolvedValue({ rowCount: 1 }) };
        }),
      }),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandleWalkinQueue({});
    const result = await handler({
      db,
      ...depsWith([{ email: "g@x.com", phone: "+40700111222" }]),
    });

    expect(result.tableName).toBe("walkin_queue");
    expect(result.rowsRedacted).toBe(1);
    expect(setValues!.guestName).toBe("Redacted");
    expect(setValues!.guestPhone).toBeNull();
    expect(setValues!.notes).toBeNull();
    expect(setValues!.redactedAt).toBeInstanceOf(Date);
  });

  it("skips when there is no captured phone (walk-in is phone-keyed)", async () => {
    const db = { update: jest.fn() } as unknown as HandlerDeps["db"];
    const handler = makeHandleWalkinQueue({});
    const result = await handler({
      db,
      ...depsWith([{ email: "g@x.com", phone: null }]),
    });
    expect(result.rowsRedacted).toBe(0);
    expect(result.skipped).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });
});
