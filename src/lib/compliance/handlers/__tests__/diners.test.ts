import { makeHandleDiners } from "../diners";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handleDiners", () => {
  it("calls pseudonymiseDiner once per dinerId with the correct args", async () => {
    const pseudonymise = jest.fn().mockResolvedValue(undefined);
    const handler = makeHandleDiners({ pseudonymiseDiner: pseudonymise });

    const result = await handler({
      db: {} as HandlerDeps["db"],
      dsrId: "11111111-1111-1111-1111-111111111111",
      dinerIds: ["d1", "d2", "d3"],
      capturedIdentifiers: [],
      actorUserId: "admin-1",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });

    expect(pseudonymise).toHaveBeenCalledTimes(3);
    expect(pseudonymise).toHaveBeenCalledWith({
      dinerId: "d1",
      reason: "gdpr_erasure_dsr_11111111-1111-1111-1111-111111111111",
      actorUserId: "admin-1",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });
    expect(result.tableName).toBe("diners");
    expect(result.rowsRedacted).toBe(3);
    expect(result.skipped).toBe(false);
  });

  it("is a no-op when dinerIds is empty", async () => {
    const pseudonymise = jest.fn();
    const handler = makeHandleDiners({ pseudonymiseDiner: pseudonymise });
    const result = await handler({
      db: {} as HandlerDeps["db"],
      dsrId: "11111111-1111-1111-1111-111111111111",
      dinerIds: [],
      capturedIdentifiers: [],
      actorUserId: "admin",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });
    expect(pseudonymise).not.toHaveBeenCalled();
    expect(result.rowsRedacted).toBe(0);
    expect(result.skipped).toBe(true);
  });
});
