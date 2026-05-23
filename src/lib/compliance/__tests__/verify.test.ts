/**
 * @jest-environment node
 */

jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/compliance/pii-table-registry", () => ({
  PII_TABLE_REGISTRY: [],
}));

import { makeRunErasureVerification } from "../verify";

describe("runErasureVerification", () => {
  function deps(override: any = {}) {
    return {
      recordAudit: jest.fn().mockResolvedValue(undefined),
      sentryAlert: jest.fn(),
      registry: [],
      ...override,
    };
  }

  it("records erasure_verification_passed when no residual PII", async () => {
    const verifyQ = jest.fn().mockResolvedValue({ tableName: "diners", rowsScanned: 5, rowsWithResidualPii: 0, residualRowIds: [] });
    const d = deps({
      registry: [{ tableName: "diners", shipped: true, handler: null, verificationQuery: verifyQ, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" }],
    });
    const subject = makeRunErasureVerification(d);
    await subject();
    expect(d.recordAudit.mock.calls[0][0].action).toMatch(/erasure_verification_passed/);
    expect(d.sentryAlert).not.toHaveBeenCalled();
  });

  it("records erasure_verification_failed + sentry alert on residual PII", async () => {
    const verifyQ = jest.fn().mockResolvedValue({ tableName: "diners", rowsScanned: 1, rowsWithResidualPii: 1, residualRowIds: ["row-1"] });
    const d = deps({
      registry: [{ tableName: "diners", shipped: true, handler: null, verificationQuery: verifyQ, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" }],
    });
    const subject = makeRunErasureVerification(d);
    await subject();
    expect(d.recordAudit.mock.calls[0][0].action).toMatch(/erasure_verification_failed/);
    expect(d.sentryAlert).toHaveBeenCalledWith("erasure_verification_failed", expect.any(Object));
  });

  it("skips stub registry entries (shipped:false)", async () => {
    const verifyQ = jest.fn();
    const d = deps({
      registry: [{ tableName: "billing_audit_log", shipped: false, handler: null, verificationQuery: verifyQ, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" }],
    });
    const subject = makeRunErasureVerification(d);
    await subject();
    expect(verifyQ).not.toHaveBeenCalled();
  });
});
