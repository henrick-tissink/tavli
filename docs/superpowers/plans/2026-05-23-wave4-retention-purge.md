# Wave 4 §13 retention_policies + nightly purge job — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1 GDPR / RO-Codul-Fiscal data retention enforcement — `retention_policies` table with locked seed + nightly purge sweep at 04:30 UTC + reuse the pre-existing `AUDIT.compliance.retention_purge_run` audit action.

**Architecture:** Declarative retention. The `retention_policies` table holds a row per scoped table (5 currently-live + 6 forward-declared for future Waves). The nightly purge engine iterates every policy: silently skips missing tables via `to_regclass`, hard-deletes in 5000-row chunks for live tables, stubs anonymise + exception_predicate + archive_offline (no v1 consumers). One audit row per policy per execution.

**Tech Stack:** Next.js 15 · TypeScript · Drizzle ORM · Supabase Postgres · pg-boss · Jest.

**Spec:** [`docs/superpowers/specs/2026-05-23-wave4-retention-purge-design.md`](../specs/2026-05-23-wave4-retention-purge-design.md)

---

## File structure

**New:**
- `drizzle/migrations/0032_retention_policies.sql` — table + RLS + 11-row seed
- `src/lib/compliance/retention.ts` — purge engine
- `src/lib/compliance/__tests__/retention.test.ts` — engine tests

**Modified:**
- `drizzle/migrations/meta/_journal.json` — entry 32
- `src/lib/db/schema.ts` — `retentionPolicies` table
- `src/lib/jobs/handlers/compliance.ts` — `handleRetentionPurge` wrapper
- `scripts/worker.ts` — `boss.work` + `boss.schedule(JOBS.compliance.retentionPurge, "30 4 * * *")`
- `docs/superpowers/architecture/build-order.md` — annotate Wave 4 retention/purge shipped

**NOT modified** — `src/lib/audit/actions.ts` already has `retention_purge_run`; reused. `src/lib/jobs/keys.ts` already has `JOBS.compliance.retentionPurge`; reused.

---

## Phase 1 — Schema + seed

### Task 1: Migration 0032 — `retention_policies` table + full seed

**Files:**
- Create: `drizzle/migrations/0032_retention_policies.sql`
- Modify: `drizzle/migrations/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Write the migration SQL**

Create `drizzle/migrations/0032_retention_policies.sql`:

```sql
-- 0032_retention_policies.sql
-- §13 §4.3 — declarative data retention. The nightly purge job iterates these
-- rows; future-wave tables sit as forward-declared policies that the job skips
-- silently until their tables ship.

CREATE TABLE "retention_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_table" varchar(80) NOT NULL UNIQUE,
  "retention_period_days" integer NOT NULL,
  "action_on_expiry" varchar(20) NOT NULL,
  "applies_to_column" varchar(60) NOT NULL DEFAULT 'created_at',
  "exception_predicate" jsonb,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_action_on_expiry"
    CHECK ("action_on_expiry" IN ('hard_delete', 'anonymise', 'archive_offline'))
);

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE "retention_policies" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retention_policies_admin_read"
  ON "retention_policies" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid() AND p."role" = 'admin'
  ));

-- No INSERT/UPDATE/DELETE policies — service-role only.

-- ─── Seed (locked policies — see spec §2.1) ────────────────────────────
INSERT INTO "retention_policies" (scope_table, retention_period_days, action_on_expiry, applies_to_column, exception_predicate, notes) VALUES
  ('audit_logs',              2555, 'hard_delete',     'created_at', NULL,
    'RO Codul Fiscal accounting retention (billing events flow here)'),
  ('transactional_email_log',  730, 'hard_delete',     'created_at', NULL,
    'ANPC inspection window'),
  ('diner_pii_access_log',     730, 'hard_delete',     'created_at', NULL,
    'ANPC PII-access defensibility'),
  ('webhook_events',            90, 'hard_delete',     'created_at', NULL,
    'Idempotency log only, not legally significant'),
  ('data_subject_requests',   1825, 'hard_delete',     'created_at', NULL,
    'Demonstrates GDPR compliance history'),
  ('reservation_status_log',  1825, 'hard_delete',     'created_at', NULL,
    'Industry standard for booking history (Wave 4 §08 future)'),
  ('table_status_log',         365, 'hard_delete',     'created_at', NULL,
    'Operational data (Wave 4 §08 future)'),
  ('marketing_consent_audit', 9999, 'hard_delete',     'created_at',
    jsonb_build_object(
      'table', 'marketing_consents',
      'condition', 'active_consent_exists',
      'predicate_sql', 'not exists (select 1 from marketing_consents mc where mc.diner_id = marketing_consent_audit.diner_id and mc.channel = marketing_consent_audit.channel and mc.revoked_at is null)'
    ),
    'GDPR Art 7(1) — indefinite while consent active; 730d post-revocation otherwise (Wave 7 §11)'),
  ('marketing_link_clicks',    365, 'hard_delete',     'created_at', NULL,
    'Pure analytics; rolled into marketing_sends before purge (Wave 7 §11)'),
  ('marketing_sends',         1095, 'anonymise',       'created_at', NULL,
    'PII cleared; analytics shell retained for reporting (Wave 7 §11)'),
  ('billing_audit_log',       2555, 'hard_delete',     'created_at', NULL,
    'RO Codul Fiscal (Wave 5 §12)')
ON CONFLICT (scope_table) DO NOTHING;
```

- [ ] **Step 2: Append journal entry**

Append entry 32 to `drizzle/migrations/meta/_journal.json` matching the existing pattern (look at idx 31 from sub-unit A's commit `999f889`). Use `idx: 32`, `tag: "0032_retention_policies"`, fresh `when` timestamp, `version: "7"`, `breakpoints: true`.

- [ ] **Step 3: Add Drizzle schema entry**

In `src/lib/db/schema.ts`, near the existing compliance tables (e.g. after `dataSubjectRequests`), append:

```ts
// ─── retention_policies ─────────────────────────────────────────────────
// §13 §4.3 — declarative retention rules. The nightly purge job iterates
// these rows. Future-wave tables are forward-declared; the job skips them
// via to_regclass until those tables ship.
export const retentionPolicies = pgTable(
  "retention_policies",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    scopeTable: varchar("scope_table", { length: 80 }).notNull().unique(),
    retentionPeriodDays: integer("retention_period_days").notNull(),
    actionOnExpiry: varchar("action_on_expiry", { length: 20 }).notNull(),
    appliesToColumn: varchar("applies_to_column", { length: 60 }).notNull().default("created_at"),
    exceptionPredicate: jsonb("exception_predicate"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
);
```

- [ ] **Step 4: Apply migration locally**

Run: `psql "$DATABASE_URL" -f drizzle/migrations/0032_retention_policies.sql`
Expected: `CREATE TABLE` + `ALTER TABLE` + `CREATE POLICY` + `INSERT 0 11` outputs.

(NOT `drizzle-kit migrate` — local bookkeeping is out of sync per sub-unit A's T1 finding.)

- [ ] **Step 5: Verify seed**

Run: `psql "$DATABASE_URL" -c "SELECT scope_table, retention_period_days, action_on_expiry FROM retention_policies ORDER BY scope_table;"`
Expected: 11 rows showing all the seed policies (audit_logs / billing_audit_log / data_subject_requests / diner_pii_access_log / marketing_consent_audit / marketing_link_clicks / marketing_sends / reservation_status_log / table_status_log / transactional_email_log / webhook_events).

- [ ] **Step 6: Commit**

```bash
git add drizzle/migrations/0032_retention_policies.sql drizzle/migrations/meta/_journal.json src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(compliance): retention_policies table + 11-row v1 seed (§13 §4.3 Wave 4 sub-unit B.1)

Forward-declared rows for future-wave tables (marketing_*, reservation_status_log,
table_status_log, billing_audit_log) sit alongside the 5 live tables. Purge job
in next commit silently skips missing tables via to_regclass.

CHECK constraint on action_on_expiry locks to ('hard_delete','anonymise','archive_offline').
RLS allows admin read; service-role writes only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Purge engine + tests

### Task 2: Write the retention purge engine test file

**Files:**
- Create: `src/lib/compliance/__tests__/retention.test.ts`

- [ ] **Step 1: Write the failing test file (all 9 tests)**

Create `src/lib/compliance/__tests__/retention.test.ts`:

```ts
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

  it("anonymise stub — failed + sentry warn", async () => {
    const d = makeDeps({
      db: makeDb({
        loadPolicies: [makePolicy({ scopeTable: "marketing_sends", actionOnExpiry: "anonymise" })],
        tableExists: { marketing_sends: true },
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/compliance/__tests__/retention.test.ts`
Expected: FAIL — module `../retention` not found.

### Task 3: Implement the purge engine

**Files:**
- Create: `src/lib/compliance/retention.ts`

- [ ] **Step 1: Implement the engine**

Create `src/lib/compliance/retention.ts`:

```ts
/**
 * runRetentionPurge — §13 §8.1 nightly retention sweep.
 *
 * Iterates retention_policies. For each:
 *   1. to_regclass check — skip silently if the scope_table doesn't exist yet
 *      (forward-declared future-wave policies stay in the seed)
 *   2. exception_predicate stub — v1 throws if any live policy has one; Wave 7
 *      ships the structured-AST predicate engine when marketing_consent_audit ships
 *   3. action dispatch:
 *      - hard_delete: chunked DELETE loop (5000 rows / transaction, oldest first)
 *      - anonymise: throws (Wave 7 ships marketing_sends + column registry)
 *      - archive_offline: throws (no v1 consumer)
 *   4. recordAudit ONCE per policy (per spec §8.2 audit_logs self-purge note)
 *   5. Per-policy failures are isolated — Sentry-capture + continue to next policy
 *
 * Identifier validation: scope_table + applies_to_column are NOT user-controlled
 * (seed-locked at migration time) but are still validated as PG identifiers
 * before splicing into SQL templates — defence in depth.
 */

import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { retentionPolicies } from "@/lib/db/schema";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

export type RetentionAction = "hard_delete" | "anonymise" | "archive_offline";

export interface RetentionPolicy {
  id: string;
  scopeTable: string;
  retentionPeriodDays: number;
  actionOnExpiry: RetentionAction;
  appliesToColumn: string;
  exceptionPredicate: ExceptionPredicate | null;
}

export interface ExceptionPredicate {
  table: string;
  condition: string;
  predicate_sql: string;
}

export interface PolicyResult {
  scopeTable: string;
  status: "purged" | "skipped_table_missing" | "skipped_no_handler" | "failed";
  rowsAffected: number;
  errorMessage?: string;
}

interface Deps {
  db: typeof dbAdmin;
  recordAudit: typeof defaultRecordAudit;
  sentryAlert: (msg: string, ctx: unknown) => void;
}

const CHUNK_SIZE = 5000;
const IDENT_RX = /^[a-z_][a-z0-9_]*$/;

export function makeRunRetentionPurge(deps: Deps) {
  return async function runRetentionPurge(): Promise<PolicyResult[]> {
    const policies = (await deps.db.select().from(retentionPolicies)) as unknown as RetentionPolicy[];
    const results: PolicyResult[] = [];

    for (const policy of policies) {
      try {
        const result = await processPolicy(policy, deps);
        results.push(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        deps.sentryAlert("retention_purge_unexpected", { scope_table: policy.scopeTable, error: msg });
        results.push({ scopeTable: policy.scopeTable, status: "failed", rowsAffected: 0, errorMessage: msg });
      }
    }

    return results;
  };
}

async function processPolicy(policy: RetentionPolicy, deps: Deps): Promise<PolicyResult> {
  // Identifier validation — defence in depth against future migration mistakes.
  if (!IDENT_RX.test(policy.scopeTable)) {
    deps.sentryAlert("retention_purge_invalid_identifier", { scope_table: policy.scopeTable, field: "scope_table" });
    return { scopeTable: policy.scopeTable, status: "failed", rowsAffected: 0, errorMessage: `invalid scope_table identifier: ${policy.scopeTable}` };
  }
  if (!IDENT_RX.test(policy.appliesToColumn)) {
    deps.sentryAlert("retention_purge_invalid_identifier", { scope_table: policy.scopeTable, field: "applies_to_column" });
    return { scopeTable: policy.scopeTable, status: "failed", rowsAffected: 0, errorMessage: `invalid applies_to_column identifier: ${policy.appliesToColumn}` };
  }

  // 1. to_regclass check — skip if table doesn't exist yet.
  const existsResult = (await deps.db.execute(sql`SELECT to_regclass(${policy.scopeTable}) AS exists`)) as unknown as Array<{ exists: string | null }>;
  if (!existsResult[0]?.exists) {
    return { scopeTable: policy.scopeTable, status: "skipped_table_missing", rowsAffected: 0 };
  }

  // 2. exception_predicate stub.
  if (policy.exceptionPredicate !== null) {
    deps.sentryAlert("retention_purge_predicate_not_implemented", { scope_table: policy.scopeTable, condition: policy.exceptionPredicate.condition });
    return { scopeTable: policy.scopeTable, status: "skipped_no_handler", rowsAffected: 0, errorMessage: "exception_predicate not implemented in v1" };
  }

  // 3. action dispatch.
  let rowsAffected: number;
  try {
    switch (policy.actionOnExpiry) {
      case "hard_delete":
        rowsAffected = await runHardDelete(policy, deps);
        break;
      case "anonymise":
        throw new Error(`anonymise not implemented for scope_table='${policy.scopeTable}' — Wave 7 ships marketing_sends + the columns-to-null registry`);
      case "archive_offline":
        throw new Error(`archive_offline not implemented for scope_table='${policy.scopeTable}' — no v1 consumer`);
      default: {
        const _exhaustive: never = policy.actionOnExpiry;
        throw new Error(`unknown action_on_expiry: ${String(_exhaustive)}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    deps.sentryAlert("retention_purge_action_failed", { scope_table: policy.scopeTable, action: policy.actionOnExpiry, error: msg });
    return { scopeTable: policy.scopeTable, status: "failed", rowsAffected: 0, errorMessage: msg };
  }

  // 4. Audit — AFTER the DELETE succeeds (so the just-written audit row has
  //    a fresh created_at and won't be caught by THIS execution's cutoff
  //    even when scope_table is audit_logs).
  await deps.recordAudit({
    action: AUDIT.compliance.retention_purge_run,
    subjectType: "retention_policy",
    subjectId: policy.id,
    actorRole: "system",
    context: {
      scope_table: policy.scopeTable,
      rows_affected: rowsAffected,
      retention_period_days: policy.retentionPeriodDays,
    },
  });

  return { scopeTable: policy.scopeTable, status: "purged", rowsAffected };
}

async function runHardDelete(policy: RetentionPolicy, deps: Deps): Promise<number> {
  // scope_table + applies_to_column are validated as PG identifiers above
  // (IDENT_RX) so splicing is safe. cutoff value is parameterised.
  const tableId = sql.raw(`"${policy.scopeTable}"`);
  const columnId = sql.raw(`"${policy.appliesToColumn}"`);
  const days = policy.retentionPeriodDays;

  let total = 0;
  while (true) {
    const updated = await deps.db.execute<{ id: string }>(sql`
      DELETE FROM ${tableId}
       WHERE id IN (
         SELECT id FROM ${tableId}
          WHERE ${columnId} < (now() - (${days} || ' days')::interval)
          ORDER BY ${columnId} ASC
          LIMIT ${CHUNK_SIZE}
       )
       RETURNING id;
    `);
    const rows = updated as unknown as Array<{ id: string }>;
    if (rows.length === 0) break;
    total += rows.length;
    if (rows.length < CHUNK_SIZE) break;
  }
  return total;
}

export const runRetentionPurge = makeRunRetentionPurge({
  db: dbAdmin,
  recordAudit: defaultRecordAudit,
  sentryAlert: (msg, ctx) => {
    // Production wiring captures via Sentry; the dev/test fallback logs.
    console.warn(`[sentry] ${msg}`, ctx);
  },
});
```

- [ ] **Step 2: Run test to verify passing**

Run: `npm test -- src/lib/compliance/__tests__/retention.test.ts`
Expected: 9 tests pass.

- [ ] **Step 3: TS compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/compliance/retention.ts src/lib/compliance/__tests__/retention.test.ts
git commit -m "$(cat <<'EOF'
feat(compliance): retention purge engine + tests (§13 §8.1 Wave 4 sub-unit B.2)

makeRunRetentionPurge iterates retention_policies, dispatches per actionOnExpiry:
  - hard_delete: 5000-row chunked DELETE loop (oldest first)
  - anonymise: throws (Wave 7 ships marketing_sends + column registry)
  - archive_offline: throws (no v1 consumer)
to_regclass short-circuits forward-declared future-wave tables. JSONB exception
predicate parses but throws if a live policy has one (Wave 7 ships the structured
predicate AST). Per-policy failure isolation via Sentry-capture + continue.
recordAudit fires AFTER the DELETE succeeds (avoids audit_logs self-purge
ordering issue). Identifier validation regex (defence-in-depth) blocks any
malformed scope_table / applies_to_column values.

9 tests cover happy path, chunking, table-missing skip, predicate stub,
anonymise stub, archive stub, failure isolation, identifier validation,
audit ordering. Reuses pre-existing AUDIT.compliance.retention_purge_run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Worker registration

### Task 4: Handler wrapper + worker schedule

**Files:**
- Modify: `src/lib/jobs/handlers/compliance.ts`
- Modify: `scripts/worker.ts`

- [ ] **Step 1: Add handler wrapper**

In `src/lib/jobs/handlers/compliance.ts`, alongside the existing wrappers, add:

```ts
import { runRetentionPurge } from "@/lib/compliance/retention";

export async function handleRetentionPurge(): Promise<void> {
  await runRetentionPurge();
}
```

- [ ] **Step 2: Register handler + schedule in worker**

In `scripts/worker.ts`, after the existing `boss.schedule(JOBS.diner.purgePseudonymised, "0 4 * * *")` line:

```ts
import { handleRetentionPurge } from "@/lib/jobs/handlers/compliance";

// (alongside the other boss.work calls in main()):
await boss.work(JOBS.compliance.retentionPurge, async () => {
  await handleRetentionPurge();
});

await boss.schedule(JOBS.compliance.retentionPurge, "30 4 * * *");

console.log("[worker] retentionPurge scheduled (30 4 * * *)");
```

- [ ] **Step 3: Verify TS compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/jobs/handlers/compliance.ts scripts/worker.ts
git commit -m "$(cat <<'EOF'
feat(jobs): register retentionPurge handler + nightly schedule (Wave 4 sub-unit B.3)

JOBS.compliance.retentionPurge handler wired at worker bootstrap.
boss.schedule runs the sweep nightly at 04:30 UTC (30 min after the
daily purgePseudonymised at 04:00 — avoids vacuum/lock contention).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Production migration

### Task 5: Apply migration 0032 to production

**Files:** none (production state changes).

- [ ] **Step 1: Confirm prod head**

Run:
```bash
set -a; source .env.prod; set +a
psql "$DATABASE_URL" -c "SELECT id, created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 3;"
```
Expected: top row `id = 32` (sub-unit A's last migration `0031_partner_notifications_pending_erasure_request_id`).

- [ ] **Step 2: Apply migration**

Run: `psql "$DATABASE_URL" -f drizzle/migrations/0032_retention_policies.sql`
Expected: `CREATE TABLE` + `ALTER TABLE` + `CREATE POLICY` + `INSERT 0 11`.

- [ ] **Step 3: Insert drizzle bookkeeping row**

```bash
HASH=$(sha256sum drizzle/migrations/0032_retention_policies.sql | awk '{print $1}')
WHEN=$(grep -A1 "0032_retention_policies" drizzle/migrations/meta/_journal.json | grep "when" | grep -oE '[0-9]+')
psql "$DATABASE_URL" -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${HASH}', ${WHEN});"
```
Expected: `INSERT 0 1`.

- [ ] **Step 4: Verify**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT id, created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 3;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) AS policy_count FROM retention_policies;"
psql "$DATABASE_URL" -c "SELECT scope_table, retention_period_days, action_on_expiry FROM retention_policies ORDER BY retention_period_days DESC;"
```
Expected: top bookkeeping id = 33; policy_count = 11; full seed listed.

- [ ] **Step 5: Trigger Coolify redeploy** (user-side)

The schema + seed are live in prod, but the worker needs a redeploy to register the new handler + schedule. The user triggers via Coolify UI.

---

## Phase 5 — Close out

### Task 6: build-order annotation + push

**Files:**
- Modify: `docs/superpowers/architecture/build-order.md`

- [ ] **Step 1: Annotate the unit as shipped**

In `docs/superpowers/architecture/build-order.md`, find line 99 and replace:

```md
- [ ] §13 `data_subject_requests` + `retention_policies` + nightly purge job
```

with:

```md
- [x] §13 `data_subject_requests` + `retention_policies` + nightly purge job *(shipped 2026-05-23 — `data_subject_requests` in sub-unit A commit `b8f9133`; `retention_policies` + nightly purge in sub-unit B: migration 0032 with 11-row v1 seed (5 live tables + 6 forward-declared future-wave that the job skips silently via to_regclass), `src/lib/compliance/retention.ts` purge engine (hard_delete chunked, anonymise/archive_offline/exception_predicate as Wave-5/Wave-7-deferred throw-stubs), `JOBS.compliance.retentionPurge` registered at worker bootstrap + scheduled nightly 04:30 UTC, identifier-validation regex hardens against future malformed seeds, recordAudit fires AFTER DELETE so audit_logs self-purge doesn't lose the per-policy summary. Reuses pre-existing AUDIT.compliance.retention_purge_run. First nightly run will actively purge webhook_events older than 90 days — intended.)*
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/architecture/build-order.md
git commit -m "$(cat <<'EOF'
docs(build-order): annotate Wave 4 §13 retention/purge shipped (sub-unit B)

5 commits closing the §13 data_subject_requests + retention_policies + nightly
purge job line (sub-units A and B). retention_policies table with 11-row v1
seed, nightly retentionPurge sweep at 04:30 UTC, anonymise + archive_offline +
exception_predicate stubbed for Wave 5/7 follow-up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Final checklist

- [ ] All 6 tasks complete and committed
- [ ] `npx tsc --noEmit` clean
- [ ] `npm test -- src/lib/compliance/__tests__/retention.test.ts` → 9/9 pass
- [ ] `npm run lint` no new errors / warnings beyond baseline
- [ ] Migration 0032 applied to prod with bookkeeping row (id 33)
- [ ] `retention_policies` populated with 11 seed rows in prod
- [ ] Coolify redeploy triggered
- [ ] `build-order.md` line 99 marked `[x]` with shipped-date annotation
- [ ] First nightly run (04:30 UTC) succeeds — verify via the AUDIT.compliance.retention_purge_run rows
