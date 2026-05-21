jest.mock("@/lib/audit/record", () => ({
  recordAudit: jest.fn(),
}));

import {
  recordImpersonationStart,
  recordImpersonationEnd,
} from "../impersonation";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

beforeEach(() => {
  (recordAudit as jest.Mock).mockClear();
});

describe("recordImpersonationStart", () => {
  it("writes an AUDIT.user.impersonation_started row with admin as actor + impersonator, target as subject", async () => {
    await recordImpersonationStart({
      adminUserId: "admin-1",
      targetUserId: "partner-1",
    });
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith({
      action: AUDIT.user.impersonation_started,
      subjectType: "user",
      subjectId: "partner-1",
      actorUserId: "admin-1",
      actorRole: "tavli_admin",
      impersonatorUserId: "admin-1",
      context: {},
    });
  });

  it("threads optional reason into the audit context", async () => {
    await recordImpersonationStart({
      adminUserId: "admin-1",
      targetUserId: "partner-1",
      reason: "support ticket #123",
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { reason: "support ticket #123" },
      }),
    );
  });
});

describe("recordImpersonationEnd", () => {
  it("writes an AUDIT.user.impersonation_ended row mirroring the start row's shape", async () => {
    await recordImpersonationEnd({
      adminUserId: "admin-1",
      targetUserId: "partner-1",
    });
    expect(recordAudit).toHaveBeenCalledWith({
      action: AUDIT.user.impersonation_ended,
      subjectType: "user",
      subjectId: "partner-1",
      actorUserId: "admin-1",
      actorRole: "tavli_admin",
      impersonatorUserId: "admin-1",
      context: {},
    });
  });
});
