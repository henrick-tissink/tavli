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
