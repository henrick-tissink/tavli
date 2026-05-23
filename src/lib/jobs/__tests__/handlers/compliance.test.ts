/**
 * @jest-environment node
 */

// Mock all modules with server-only / native deps before any imports.
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/email/send-transactional", () => ({ sendTransactionalEmail: jest.fn() }));
jest.mock("@/lib/email/resolve-locale", () => ({ resolveDinerLocale: jest.fn() }));
jest.mock("@react-email/render", () => ({
  render: jest.fn().mockResolvedValue("<html></html>"),
}));
jest.mock("@/emails/DataDeletionConfirmedEmail", () => ({
  DataDeletionConfirmedEmail: jest.fn().mockReturnValue(null),
  getSubject: jest.fn().mockReturnValue("Test subject"),
}));
jest.mock("@/lib/jobs/enqueue", () => ({ enqueue: jest.fn() }));
jest.mock("@/lib/compliance/handlers/partner-notifications-phase2", () => ({
  handlePartnerNotificationsPhase2: jest.fn(),
}));
// pii-table-registry imports schema and drizzle — mock to avoid pg resolution
jest.mock("@/lib/compliance/pii-table-registry", () => ({
  PII_TABLE_REGISTRY: [],
}));

import { makeHandleErasureExecute } from "../../handlers/compliance";

describe("handleErasureExecute", () => {
  const fakeDsr = {
    id: "11111111-1111-1111-1111-111111111111",
    status: "in_progress" as const,
    identityVerified: true,
    approvedByUserId: "admin-1",
    dinerId: "d1",
    identifierEmail: "alice@example.ro",
    identifierPhone: null,
  };

  function makeDeps(overrides: any = {}) {
    return {
      loadDsr: jest.fn().mockResolvedValue(fakeDsr),
      resolveDiners: jest.fn().mockResolvedValue({
        dinerIds: ["d1"],
        capturedIdentifiers: [{ dinerId: "d1", phone: null, email: "alice@example.ro" }],
      }),
      registry: [],
      updateDsrCompleted: jest.fn().mockResolvedValue(undefined),
      enqueuePhase2: jest.fn().mockResolvedValue(undefined),
      enqueuePurge: jest.fn().mockResolvedValue(undefined),
      recordAudit: jest.fn().mockResolvedValue(undefined),
      sendEmail: jest.fn().mockResolvedValue(undefined),
      resolveDinerLocale: jest.fn().mockResolvedValue("ro"),
      ...overrides,
    };
  }

  it("loads dsr, resolves diners, iterates registry, marks completed, sends email", async () => {
    const handler1 = jest.fn().mockResolvedValue({ tableName: "marketing_suppressions", rowsRedacted: 1, skipped: false });
    const deps = makeDeps({
      registry: [{ tableName: "marketing_suppressions", shipped: true, handler: handler1, verificationQuery: null, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" }],
    });
    const subject = makeHandleErasureExecute(deps);

    await subject({ requestId: fakeDsr.id });

    expect(deps.loadDsr).toHaveBeenCalledWith(fakeDsr.id);
    expect(handler1).toHaveBeenCalled();
    expect(deps.enqueuePhase2).toHaveBeenCalledWith({ requestId: fakeDsr.id });
    expect(deps.updateDsrCompleted).toHaveBeenCalled();
    expect(deps.enqueuePurge).toHaveBeenCalledWith({ dinerId: "d1" });
    expect(deps.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "compliance.dsr_cascade_executed" }));
    expect(deps.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "alice@example.ro", locale: "ro" }));
  });

  it("throws TV1105 when DSR status is not in_progress", async () => {
    const deps = makeDeps({ loadDsr: jest.fn().mockResolvedValue({ ...fakeDsr, status: "received" }) });
    const subject = makeHandleErasureExecute(deps);
    await expect(subject({ requestId: fakeDsr.id })).rejects.toThrow(/TV1105/);
  });

  it("throws TV1101 when identity not verified", async () => {
    const deps = makeDeps({ loadDsr: jest.fn().mockResolvedValue({ ...fakeDsr, identityVerified: false }) });
    const subject = makeHandleErasureExecute(deps);
    await expect(subject({ requestId: fakeDsr.id })).rejects.toThrow(/TV1101/);
  });

  it("throws TV1101 when approvedByUserId is missing despite identity_verified", async () => {
    const deps = makeDeps({ loadDsr: jest.fn().mockResolvedValue({ ...fakeDsr, approvedByUserId: null }) });
    const subject = makeHandleErasureExecute(deps);
    await expect(subject({ requestId: fakeDsr.id })).rejects.toThrow(/TV1101/);
  });

  it("throws TV1100 when dsr not found", async () => {
    const deps = makeDeps({ loadDsr: jest.fn().mockResolvedValue(null) });
    const subject = makeHandleErasureExecute(deps);
    await expect(subject({ requestId: fakeDsr.id })).rejects.toThrow(/TV1100/);
  });

  it("skips stub registry entries (shipped:false or handler:null)", async () => {
    const handlerNeverCalled = jest.fn();
    const deps = makeDeps({
      registry: [
        { tableName: "billing_audit_log", shipped: false, handler: null, verificationQuery: null, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" },
        { tableName: "reservations", shipped: true, handler: null, coveredBy: "diners", verificationQuery: null, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" },
        { tableName: "marketing_suppressions", shipped: true, handler: handlerNeverCalled, verificationQuery: null, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" },
      ],
    });
    const subject = makeHandleErasureExecute(deps);
    await subject({ requestId: fakeDsr.id });
    expect(handlerNeverCalled).toHaveBeenCalled(); // the only one with shipped:true && handler !== null
  });

  it("skips sendEmail when no captured identifier has an email", async () => {
    const deps = makeDeps({
      resolveDiners: jest.fn().mockResolvedValue({
        dinerIds: ["d1"],
        capturedIdentifiers: [{ dinerId: "d1", phone: "+40700000000", email: null }],
      }),
    });
    const subject = makeHandleErasureExecute(deps);
    await subject({ requestId: fakeDsr.id });
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
});
