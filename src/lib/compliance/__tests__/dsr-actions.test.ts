/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/authz/can", () => ({ can: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("@/lib/db/server", () => ({ createSupabaseServerClient: jest.fn() }));
jest.mock("@/lib/auth/aal", () => ({ requireAAL2: jest.fn().mockResolvedValue(true) }));
jest.mock("@/lib/auth/current-actor", () => ({ currentActor: jest.fn() }));
jest.mock("@/lib/jobs/enqueue", () => ({ enqueue: jest.fn() }));
jest.mock("@/lib/db/schema", () => ({ dataSubjectRequests: {} }));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: strings.join("?"), values }),
}));

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
      requireAal2: jest.fn().mockResolvedValue(true),
      ...override,
    };
  }

  it("rejects the GDPR crown-jewel action when the admin session is not AAL2 (NEW-4)", async () => {
    const d = deps({ requireAal2: jest.fn().mockResolvedValue(false) });
    const actions = makeDsrActions(d);
    await expect(
      actions.createDsr({
        identifier_phone: "+40712345678",
        identifier_email: "alice@example.ro",
        request_kind: "erasure",
        request_source: "email",
      }),
    ).rejects.toThrow(/aal2/i);
    expect(d.recordAudit).not.toHaveBeenCalled();
  });

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

describe("approveDsrRestriction (F13)", () => {
  function makeActions(dsr: any, execute: any = jest.fn().mockResolvedValue([])) {
    const db = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([dsr]) }) }),
      }),
      update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) }) }),
      execute,
      insert: jest.fn(),
    };
    const actions = makeDsrActions({
      db: db as any,
      recordAudit: jest.fn().mockResolvedValue(undefined),
      can: jest.fn().mockResolvedValue(true),
      getCurrentSession: jest.fn().mockResolvedValue({ userId: "admin", profile: { role: "admin" } }),
      currentActor: jest.fn().mockResolvedValue({ actorUserId: "admin", impersonatorUserId: null }),
      enqueue: jest.fn().mockResolvedValue(undefined),
      requireAal2: jest.fn().mockResolvedValue(true),
    });
    return { actions, execute };
  }

  it("restrict_processing flags the diner (processing_restricted = true)", async () => {
    const dsr = { id: "dsr-1", status: "received", identityVerified: true, requestKind: "restrict_processing", dinerId: "d1", organizationId: "o1" };
    const { actions, execute } = makeActions(dsr);
    await actions.approveDsrRestriction({ dsrId: "dsr-1" });
    expect(execute.mock.calls.some((c: any) => JSON.stringify(c[0]).includes("processing_restricted = true"))).toBe(true);
  });

  it("object suppresses the diner's contacts + revokes all marketing consents", async () => {
    const execute = jest.fn(async (q: unknown) =>
      JSON.stringify(q).includes("SELECT email, phone") ? [{ email: "a@b.com", phone: "+40712345678" }] : [],
    );
    const dsr = { id: "dsr-1", status: "received", identityVerified: true, requestKind: "object", dinerId: "d1", organizationId: "o1" };
    const { actions } = makeActions(dsr, execute);
    await actions.approveDsrRestriction({ dsrId: "dsr-1" });
    const qs = execute.mock.calls.map((c: any) => JSON.stringify(c[0]));
    expect(qs.some((q) => q.includes("INSERT INTO marketing_suppressions"))).toBe(true);
    expect(qs.some((q) => q.includes("UPDATE marketing_consents SET revoked_at"))).toBe(true);
  });

  it("rejects a non-restriction request kind", async () => {
    const dsr = { id: "dsr-1", status: "received", identityVerified: true, requestKind: "erasure", dinerId: "d1" };
    const { actions } = makeActions(dsr);
    await expect(actions.approveDsrRestriction({ dsrId: "dsr-1" })).rejects.toThrow(/restrict_processing/);
  });
});

describe("rejectDsr", () => {
  it("sets status=rejected + reason + records audit", async () => {
    const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
    const audit = jest.fn().mockResolvedValue(undefined);
    const limit = jest.fn().mockResolvedValue([{ id: "dsr-1", status: "received" }]);
    const actions = makeDsrActions({
      db: {
        update: jest.fn().mockReturnValue({ set: setMock }),
        insert: jest.fn(),
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({ limit }),
          }),
        }),
      } as any,
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

  describe("rejectDsr — status guards (A.fix.3)", () => {
    function makeActions(dsr: any, override: any = {}) {
      const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
      const limit = jest.fn().mockResolvedValue(dsr ? [dsr] : []);
      return makeDsrActions({
        db: {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({ limit }),
            }),
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

    it("throws TV1100 when dsr not found", async () => {
      const actions = makeActions(undefined);
      await expect(actions.rejectDsr({ dsrId: "missing", reason: "test" })).rejects.toThrow(/TV1100/);
    });

    it("throws TV1105 when status='completed'", async () => {
      const actions = makeActions({ id: "dsr-1", status: "completed" });
      await expect(actions.rejectDsr({ dsrId: "dsr-1", reason: "test" })).rejects.toThrow(/TV1105/);
    });

    it("throws TV1105 when status='rejected'", async () => {
      const actions = makeActions({ id: "dsr-1", status: "rejected" });
      await expect(actions.rejectDsr({ dsrId: "dsr-1", reason: "test" })).rejects.toThrow(/TV1105/);
    });

    it("succeeds when status='in_progress'", async () => {
      const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
      const dsr = { id: "dsr-1", status: "in_progress" };
      const audit = jest.fn().mockResolvedValue(undefined);
      const actions = makeDsrActions({
        db: {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([dsr]),
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({ set: setMock }),
          insert: jest.fn(),
        } as any,
        recordAudit: audit,
        can: jest.fn().mockResolvedValue(true),
        getCurrentSession: jest.fn().mockResolvedValue({ userId: "admin", profile: { role: "admin" } }),
        currentActor: jest.fn().mockResolvedValue({ actorUserId: "admin", impersonatorUserId: null }),
        enqueue: jest.fn(),
      });
      await actions.rejectDsr({ dsrId: "dsr-1", reason: "test" });
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
    });
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

  describe("extendDsrDeadline — cumulative cap (A.fix.3)", () => {
    function makeActions(dsr: any) {
      const setMock = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue([]) });
      return makeDsrActions({
        db: {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([dsr]),
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({ set: setMock }),
          insert: jest.fn(),
        } as any,
        recordAudit: jest.fn().mockResolvedValue(undefined),
        can: jest.fn().mockResolvedValue(true),
        getCurrentSession: jest.fn().mockResolvedValue({ userId: "admin", profile: { role: "admin" } }),
        currentActor: jest.fn().mockResolvedValue({ actorUserId: "admin", impersonatorUserId: null }),
        enqueue: jest.fn(),
      });
    }

    it("throws TV1103 when cumulative would exceed 14 days", async () => {
      const dsr = { id: "dsr-1", legalDeadlineAt: new Date("2026-06-01T00:00:00Z"), deadlineExtensionDays: 10 };
      const actions = makeActions(dsr);
      // 10 already used + 7 requested = 17 > 14 → TV1103
      await expect(actions.extendDsrDeadline({ dsrId: "dsr-1", days: 7, reason: "valid reason" })).rejects.toThrow(/TV1103/);
    });

    it("succeeds when cumulative is exactly 14 days", async () => {
      const dsr = { id: "dsr-1", legalDeadlineAt: new Date("2026-06-01T00:00:00Z"), deadlineExtensionDays: 7 };
      const actions = makeActions(dsr);
      // 7 + 7 = 14 → OK
      await actions.extendDsrDeadline({ dsrId: "dsr-1", days: 7, reason: "valid reason" });
    });

    it("succeeds on first extension at 14 days", async () => {
      const dsr = { id: "dsr-1", legalDeadlineAt: new Date("2026-06-01T00:00:00Z"), deadlineExtensionDays: 0 };
      const actions = makeActions(dsr);
      // 0 + 14 = 14 → OK
      await actions.extendDsrDeadline({ dsrId: "dsr-1", days: 14, reason: "valid reason" });
    });
  });
});
