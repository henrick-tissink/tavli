/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ retentionPolicies: {} }));
jest.mock("@/lib/audit/record", () => ({ recordAudit: jest.fn() }));
jest.mock("@/lib/audit/actions", () => ({
  AUDIT: { compliance: { retention_purge_run: "compliance.retention_purge_run" } },
}));
jest.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: any[]) => {
      // Produce an object whose JSON.stringify output contains the raw SQL
      // text so makeDb's execute mock can match on "to_regclass" / "DELETE".
      const text = strings.raw.join(" ");
      return { queryText: text, values };
    },
    {
      raw: (text: string) => ({ rawText: text }),
    },
  ),
}));

import { makeRunRetentionPurge } from "../retention";

function makePolicy(over: Partial<any> = {}) {
  return {
    id: "policy-1",
    scopeTable: "webhook_events",
    retentionPeriodDays: 90,
    actionOnExpiry: "hard_delete",
    appliesToColumn: "created_at",
    exceptionPredicate: null,
    ...over,
  };
}

function makeDb(opts: { loadPolicies: any[]; tableExists?: Record<string, boolean>; deleteRowsPerCall?: number[]; executeMock?: jest.Mock }) {
  const policies = opts.loadPolicies;
  const tableExists = opts.tableExists ?? { webhook_events: true };
  let deleteCallIndex = 0;
  const deleteRowsPerCall = opts.deleteRowsPerCall ?? [];
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockResolvedValue(policies),
    }),
    execute: opts.executeMock ?? jest.fn().mockImplementation(async (q: any) => {
      const s = JSON.stringify(q);
      if (s.includes("to_regclass")) {
        const key = Object.keys(tableExists).find((k) => s.includes(k));
        return [{ exists: key ? tableExists[key] : null }];
      }
      if (s.includes("DELETE")) {
        const n = deleteRowsPerCall[deleteCallIndex] ?? 0;
        deleteCallIndex += 1;
        return Array.from({ length: n }, (_, i) => ({ id: `row-${deleteCallIndex}-${i}` }));
      }
      return [];
    }),
  };
}

function makeDeps(overrides: any = {}) {
  return {
    db: makeDb({ loadPolicies: [makePolicy()], deleteRowsPerCall: [3, 0] }),
    recordAudit: jest.fn().mockResolvedValue(undefined),
    sentryAlert: jest.fn(),
    ...overrides,
  };
}

describe("runRetentionPurge", () => {
  it("happy path — hard-deletes a live table + writes one audit row", async () => {
    const d = makeDeps();
    const subject = makeRunRetentionPurge(d);
    const results = await subject();

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      scopeTable: "webhook_events",
      status: "purged",
      rowsAffected: 3,
    });
    expect(d.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "compliance.retention_purge_run",
      subjectType: "retention_policy",
      subjectId: "policy-1",
    }));
    expect(d.sentryAlert).not.toHaveBeenCalled();
  });

  it("chunking — 5001 stale rows produce 2 DELETE invocations + 1 audit row", async () => {
    const d = makeDeps({
      db: makeDb({ loadPolicies: [makePolicy()], deleteRowsPerCall: [5000, 1, 0] }),
    });
    const subject = makeRunRetentionPurge(d);
    const results = await subject();

    expect(results[0].rowsAffected).toBe(5001);
    expect(d.recordAudit).toHaveBeenCalledTimes(1);
  });

  it("missing table — to_regclass null → skipped_table_missing, no audit", async () => {
    const d = makeDeps({
      db: makeDb({
        loadPolicies: [makePolicy({ scopeTable: "marketing_sends", actionOnExpiry: "anonymise" })],
        tableExists: { marketing_sends: false },
      }),
    });
    const subject = makeRunRetentionPurge(d);
    const results = await subject();

    expect(results[0].status).toBe("skipped_table_missing");
    expect(results[0].rowsAffected).toBe(0);
    expect(d.recordAudit).not.toHaveBeenCalled();
  });

  it("exception_predicate present — skipped_no_handler + sentry warn", async () => {
    const d = makeDeps({
      db: makeDb({
        loadPolicies: [makePolicy({
          scopeTable: "marketing_consent_audit",
          exceptionPredicate: { table: "marketing_consents", condition: "active_consent_exists", predicate_sql: "not exists (...)" },
        })],
        tableExists: { marketing_consent_audit: true },
      }),
    });
    const subject = makeRunRetentionPurge(d);
    const results = await subject();

    expect(results[0].status).toBe("skipped_no_handler");
    expect(d.recordAudit).not.toHaveBeenCalled();
    expect(d.sentryAlert).toHaveBeenCalled();
  });

  it("anonymise — nulls PII columns on marketing_sends (chunked UPDATE), returns purged", async () => {
    let updateCalls = 0;
    const executeMock = jest.fn().mockImplementation(async (q: any) => {
      const s = JSON.stringify(q);
      if (s.includes("to_regclass")) return [{ exists: true }];
      if (s.includes("UPDATE")) {
        updateCalls += 1;
        // First pass returns 2 rows, second pass returns 0 → loop terminates.
        return updateCalls === 1 ? [{ id: "ms-1" }, { id: "ms-2" }] : [];
      }
      return [];
    });
    const d = makeDeps({
      db: {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockResolvedValue([
            makePolicy({ scopeTable: "marketing_sends", actionOnExpiry: "anonymise" }),
          ]),
        }),
        execute: executeMock,
      },
    });
    const subject = makeRunRetentionPurge(d);
    const results = await subject();

    expect(results[0].status).toBe("purged");
    expect(results[0].rowsAffected).toBe(2);
    expect(d.recordAudit).toHaveBeenCalledTimes(1);
    expect(d.sentryAlert).not.toHaveBeenCalled();
  });

  it("anonymise without a column map — failed + sentry warn", async () => {
    const d = makeDeps({
      db: makeDb({
        loadPolicies: [makePolicy({ scopeTable: "audit_logs", actionOnExpiry: "anonymise" })],
        tableExists: { audit_logs: true },
      }),
    });
    const subject = makeRunRetentionPurge(d);
    const results = await subject();

    expect(results[0].status).toBe("failed");
    expect(results[0].errorMessage).toMatch(/anonymise/i);
    expect(d.sentryAlert).toHaveBeenCalled();
  });

  it("archive_offline rejection — failed + sentry warn", async () => {
    const d = makeDeps({
      db: makeDb({
        loadPolicies: [makePolicy({ scopeTable: "audit_logs", actionOnExpiry: "archive_offline" })],
        tableExists: { audit_logs: true },
      }),
    });
    const subject = makeRunRetentionPurge(d);
    const results = await subject();

    expect(results[0].status).toBe("failed");
    expect(results[0].errorMessage).toMatch(/archive_offline/i);
    expect(d.sentryAlert).toHaveBeenCalled();
  });

  it("per-policy failure isolation — first throws, second succeeds", async () => {
    const policies = [
      makePolicy({ id: "p1", scopeTable: "audit_logs" }),
      makePolicy({ id: "p2", scopeTable: "webhook_events" }),
    ];
    let firstDeleteCalled = false;
    const executeMock = jest.fn().mockImplementation(async (q: any) => {
      const s = JSON.stringify(q);
      if (s.includes("to_regclass")) {
        return [{ exists: true }];
      }
      if (s.includes("DELETE")) {
        if (!firstDeleteCalled && s.includes("audit_logs")) {
          firstDeleteCalled = true;
          throw new Error("synthetic DELETE failure");
        }
        return [{ id: "r-1" }];
      }
      return [];
    });
    const d = makeDeps({
      db: { select: jest.fn().mockReturnValue({ from: jest.fn().mockResolvedValue(policies) }), execute: executeMock },
    });
    const subject = makeRunRetentionPurge(d);
    const results = await subject();

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("failed");
    expect(results[1].status).toBe("purged");
    expect(d.sentryAlert).toHaveBeenCalledTimes(1);
  });

  it("identifier validation — rejects scope_table with non-identifier characters", async () => {
    const d = makeDeps({
      db: makeDb({
        loadPolicies: [makePolicy({ scopeTable: "1nvalid; DROP TABLE diners;" })],
        tableExists: { "1nvalid; DROP TABLE diners;": true },
      }),
    });
    const subject = makeRunRetentionPurge(d);
    const results = await subject();

    expect(results[0].status).toBe("failed");
    expect(results[0].errorMessage).toMatch(/invalid/i);
    expect(d.sentryAlert).toHaveBeenCalled();
  });

  it("audit_logs self-purge ordering — recordAudit fires AFTER db.execute(DELETE)", async () => {
    const order: string[] = [];
    const executeMock = jest.fn().mockImplementation(async (q: any) => {
      const s = JSON.stringify(q);
      if (s.includes("to_regclass")) return [{ exists: true }];
      if (s.includes("DELETE")) {
        order.push("delete");
        return [{ id: "r-1" }];
      }
      return [];
    });
    const recordAudit = jest.fn().mockImplementation(async () => {
      order.push("audit");
    });
    const d = makeDeps({
      db: { select: jest.fn().mockReturnValue({ from: jest.fn().mockResolvedValue([makePolicy({ scopeTable: "audit_logs" })]) }), execute: executeMock },
      recordAudit,
    });
    const subject = makeRunRetentionPurge(d);
    await subject();

    expect(order.indexOf("delete")).toBeLessThan(order.indexOf("audit"));
  });
});
