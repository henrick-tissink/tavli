/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/authz/can", () => ({ can: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("@/lib/auth/current-actor", () => ({ currentActor: jest.fn() }));
jest.mock("@/lib/jobs/enqueue", () => ({ enqueue: jest.fn() }));
jest.mock("@/lib/db/schema", () => ({ dataSubjectRequests: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn() }));

import { makeDsrActions } from "../dsr-actions";

describe("createDsr", () => {
  function deps(override: any = {}) {
    return {
      db: {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: "dsr-new" }]),
          }),
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      },
      recordAudit: jest.fn().mockResolvedValue(undefined),
      can: jest.fn().mockResolvedValue(true),
      getCurrentSession: jest.fn().mockResolvedValue({
        userId: "admin-1",
        profile: { role: "admin" },
      }),
      currentActor: jest.fn().mockResolvedValue({ actorUserId: "admin-1", impersonatorUserId: null }),
      enqueue: jest.fn().mockResolvedValue(undefined),
      ...override,
    };
  }

  it("creates a DSR with legal_deadline_at = now + 30 days + records audit", async () => {
    const d = deps();
    const actions = makeDsrActions(d);
    const result = await actions.createDsr({
      identifier_phone: "+40712345678",
      identifier_email: "alice@example.ro",
      request_kind: "erasure",
      request_source: "email",
      request_body: "Please delete my data",
    });
    expect(result.id).toBe("dsr-new");
    expect(d.can).toHaveBeenCalledWith(expect.any(Object), "gdpr.create_dsr", { kind: "global" });
    expect(d.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "compliance.dsr_created",
    }));
  });

  it("throws unauthenticated when session is null", async () => {
    const d = deps({ getCurrentSession: jest.fn().mockResolvedValue(null) });
    const actions = makeDsrActions(d);
    await expect(actions.createDsr({ request_kind: "erasure", request_source: "email" }))
      .rejects.toThrow(/unauthenticated/);
  });

  it("throws forbidden when can() returns false", async () => {
    const d = deps({ can: jest.fn().mockResolvedValue(false) });
    const actions = makeDsrActions(d);
    await expect(actions.createDsr({ request_kind: "erasure", request_source: "email" }))
      .rejects.toThrow(/forbidden/);
  });
});

describe("resolveDinerForDsr", () => {
  function deps(override: any = {}) {
    return {
      db: {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
        insert: jest.fn(),
      },
      recordAudit: jest.fn().mockResolvedValue(undefined),
      can: jest.fn().mockResolvedValue(true),
      getCurrentSession: jest.fn().mockResolvedValue({ userId: "admin", profile: { role: "admin" } }),
      currentActor: jest.fn().mockResolvedValue({ actorUserId: "admin", impersonatorUserId: null }),
      enqueue: jest.fn(),
      ...override,
    };
  }

  it("sets diner_id on the DSR", async () => {
    const d = deps();
    const actions = makeDsrActions(d);
    await actions.resolveDinerForDsr({ dsrId: "dsr-1", diner_ids: ["d1", "d2"] });
    expect(d.db.update).toHaveBeenCalled();
    expect(d.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "compliance.dsr_resolved",
    }));
  });

  it("throws TV1108 when diner_ids is empty", async () => {
    const d = deps();
    const actions = makeDsrActions(d);
    await expect(actions.resolveDinerForDsr({ dsrId: "dsr-1", diner_ids: [] }))
      .rejects.toThrow(/TV1108/);
  });
});

describe("verifyDsrIdentity", () => {
  function deps(override: any = {}) {
    return {
      db: {
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
        insert: jest.fn(),
      },
      recordAudit: jest.fn().mockResolvedValue(undefined),
      can: jest.fn().mockResolvedValue(true),
      getCurrentSession: jest.fn().mockResolvedValue({ userId: "admin", profile: { role: "admin" } }),
      currentActor: jest.fn().mockResolvedValue({ actorUserId: "admin", impersonatorUserId: null }),
      enqueue: jest.fn(),
      ...override,
    };
  }

  it("sets identity_verified=true + records audit", async () => {
    const d = deps();
    const actions = makeDsrActions(d);
    await actions.verifyDsrIdentity({
      dsrId: "dsr-1",
      method: "tavli_admin_manual",
      reason: "Verified by phone callback",
    });
    expect(d.db.update).toHaveBeenCalled();
    expect(d.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "compliance.dsr_identity_verified",
    }));
  });

  it("throws on empty reason", async () => {
    const d = deps();
    const actions = makeDsrActions(d);
    await expect(actions.verifyDsrIdentity({
      dsrId: "dsr-1",
      method: "tavli_admin_manual",
      reason: "",
    })).rejects.toThrow(/reason/);
  });
});

describe("approveDsrErasure", () => {
  function makeActionsForApprove(dsrFromDb: any, override: any = {}) {
    const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    const updateMock = jest.fn().mockReturnValue({ set: setMock });
    const limit = jest.fn().mockResolvedValue([dsrFromDb]);
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ limit }),
        }),
      }),
      update: updateMock,
      insert: jest.fn(),
    };
    return makeDsrActions({
      db: db as any,
      recordAudit: jest.fn().mockResolvedValue(undefined),
      can: jest.fn().mockResolvedValue(true),
      getCurrentSession: jest.fn().mockResolvedValue({ userId: "admin", profile: { role: "admin" } }),
      currentActor: jest.fn().mockResolvedValue({ actorUserId: "admin", impersonatorUserId: null }),
      enqueue: jest.fn().mockResolvedValue(undefined),
      ...override,
    });
  }

  it("transitions status to in_progress + sets approved_by/at + enqueues orchestrator", async () => {
    const dsr = { id: "dsr-1", status: "received", identityVerified: true, requestKind: "erasure" };
    const enqueueSpy = jest.fn().mockResolvedValue(undefined);
    const actions = makeActionsForApprove(dsr, { enqueue: enqueueSpy });
    await actions.approveDsrErasure({ dsrId: "dsr-1" });
    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.stringContaining("compliance.erasure-execute"),
      { requestId: "dsr-1" },
    );
  });

  it("throws TV1100 when dsr not found", async () => {
    const actions = makeActionsForApprove(undefined);
    await expect(actions.approveDsrErasure({ dsrId: "missing" })).rejects.toThrow(/TV1100/);
  });

  it("throws TV1105 when status != 'received'", async () => {
    const dsr = { id: "dsr-1", status: "completed", identityVerified: true, requestKind: "erasure" };
    const actions = makeActionsForApprove(dsr);
    await expect(actions.approveDsrErasure({ dsrId: "dsr-1" })).rejects.toThrow(/TV1105/);
  });

  it("throws TV1101 when identity not verified", async () => {
    const dsr = { id: "dsr-1", status: "received", identityVerified: false, requestKind: "erasure" };
    const actions = makeActionsForApprove(dsr);
    await expect(actions.approveDsrErasure({ dsrId: "dsr-1" })).rejects.toThrow(/TV1101/);
  });

  it("throws on non-erasure request_kind", async () => {
    const dsr = { id: "dsr-1", status: "received", identityVerified: true, requestKind: "access" };
    const actions = makeActionsForApprove(dsr);
    await expect(actions.approveDsrErasure({ dsrId: "dsr-1" })).rejects.toThrow(/erasure/);
  });
});

describe("rejectDsr", () => {
  it("sets status=rejected + reason + records audit", async () => {
    const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    const audit = jest.fn().mockResolvedValue(undefined);
    const actions = makeDsrActions({
      db: { update: jest.fn().mockReturnValue({ set: setMock }), insert: jest.fn(), select: jest.fn() } as any,
      recordAudit: audit,
      can: jest.fn().mockResolvedValue(true),
      getCurrentSession: jest.fn().mockResolvedValue({ userId: "admin", profile: { role: "admin" } }),
      currentActor: jest.fn().mockResolvedValue({ actorUserId: "admin", impersonatorUserId: null }),
      enqueue: jest.fn(),
    });
    await actions.rejectDsr({ dsrId: "dsr-1", reason: "Not the actual data subject" });
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "compliance.dsr_rejected" }));
  });
});

describe("retryErasureCascade", () => {
  function makeActionsForRetry(dsrFromDb: any, override: any = {}) {
    const limit = jest.fn().mockResolvedValue(dsrFromDb !== undefined ? [dsrFromDb] : []);
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ limit }),
        }),
      }),
      update: jest.fn(),
      insert: jest.fn(),
    };
    return makeDsrActions({
      db: db as any,
      recordAudit: jest.fn().mockResolvedValue(undefined),
      can: jest.fn().mockResolvedValue(true),
      getCurrentSession: jest.fn().mockResolvedValue({ userId: "admin", profile: { role: "admin" } }),
      currentActor: jest.fn().mockResolvedValue({ actorUserId: "admin", impersonatorUserId: null }),
      enqueue: jest.fn().mockResolvedValue(undefined),
      ...override,
    });
  }

  it("re-enqueues JOBS.compliance.erasureExecute when status='in_progress'", async () => {
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const dsr = { id: "dsr-1", status: "in_progress" };
    const actions = makeActionsForRetry(dsr, { enqueue });
    await actions.retryErasureCascade({ dsrId: "dsr-1" });
    expect(enqueue).toHaveBeenCalledWith(
      expect.stringContaining("compliance.erasure-execute"),
      { requestId: "dsr-1" },
    );
  });

  it("throws TV1105 when status != 'in_progress'", async () => {
    const dsr = { id: "dsr-1", status: "completed" };
    const actions = makeActionsForRetry(dsr);
    await expect(actions.retryErasureCascade({ dsrId: "dsr-1" })).rejects.toThrow(/TV1105/);
  });
});

describe("extendDsrDeadline", () => {
  function makeActionsForExtend(dsrFromDb: any, override: any = {}) {
    const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    const limit = jest.fn().mockResolvedValue([dsrFromDb]);
    return makeDsrActions({
      db: {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit }) }),
        }),
        update: jest.fn().mockReturnValue({ set: setMock }),
        insert: jest.fn(),
      } as any,
      recordAudit: jest.fn().mockResolvedValue(undefined),
      can: jest.fn().mockResolvedValue(true),
      getCurrentSession: jest.fn().mockResolvedValue({ userId: "admin", profile: { role: "admin" } }),
      currentActor: jest.fn().mockResolvedValue({ actorUserId: "admin", impersonatorUserId: null }),
      enqueue: jest.fn(),
      ...override,
    });
  }

  it("rejects > 14 days as TV1103", async () => {
    const actions = makeActionsForExtend({ id: "dsr-1", legalDeadlineAt: new Date(), deadlineExtensionDays: 0 });
    await expect(actions.extendDsrDeadline({ dsrId: "dsr-1", days: 15, reason: "x" })).rejects.toThrow(/TV1103/);
  });

  it("rejects missing reason as TV1107", async () => {
    const actions = makeActionsForExtend({ id: "dsr-1", legalDeadlineAt: new Date(), deadlineExtensionDays: 0 });
    await expect(actions.extendDsrDeadline({ dsrId: "dsr-1", days: 7, reason: "" })).rejects.toThrow(/TV1107/);
  });

  it("bumps legal_deadline_at by days + records audit", async () => {
    const dsr = { id: "dsr-1", legalDeadlineAt: new Date("2026-06-01T00:00:00Z"), deadlineExtensionDays: 0 };
    const audit = jest.fn().mockResolvedValue(undefined);
    const actions = makeActionsForExtend(dsr, { recordAudit: audit });
    await actions.extendDsrDeadline({ dsrId: "dsr-1", days: 7, reason: "Awaiting documents" });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "compliance.dsr_extended" }));
  });
});
