import { makeHandleProspectWaitlist } from "../prospect-waitlist";
import type { HandlerDeps } from "../../pii-table-registry";

function depsWith(emails: Array<string | null>): HandlerDeps {
  return {
    db: {} as HandlerDeps["db"],
    dsrId: "11111111-1111-1111-1111-111111111111",
    dinerIds: [],
    capturedIdentifiers: emails.map((email, i) => ({
      dinerId: `d${i}`,
      phone: null,
      email,
    })),
    actorUserId: "admin",
    impersonatorUserId: undefined,
    actorRole: "tavli_admin",
  };
}

describe("handleProspectWaitlist", () => {
  it("redacts email + source_ip + stamps redacted_at for matching captured emails", async () => {
    let setValues: any = null;
    const db = {
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((v) => {
          setValues = v;
          return { where: jest.fn().mockResolvedValue({ rowCount: 1 }) };
        }),
      }),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandleProspectWaitlist({});
    const result = await handler({ ...depsWith(["Founder@Example.com"]), db });

    expect(result.tableName).toBe("prospect_waitlist");
    expect(result.rowsRedacted).toBe(1);
    expect(setValues.sourceIp).toBeNull();
    expect(setValues.redactedAt).toBeInstanceOf(Date);
    // email must not retain the original plaintext value.
    expect(setValues.email).not.toBe("Founder@Example.com");
  });

  it("skips when there are no captured emails", async () => {
    const db = { update: jest.fn() } as unknown as HandlerDeps["db"];
    const handler = makeHandleProspectWaitlist({});
    const result = await handler({ ...depsWith([null]), db });
    expect(result.rowsRedacted).toBe(0);
    expect(result.skipped).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });
});
