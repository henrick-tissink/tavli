# Wave 4 — §13 retention_policies + nightly purge job (design)

**Date:** 2026-05-23
**Owner:** Tavli v1 build
**Wave / unit:** Wave 4 · §13 retention_policies + nightly purge job (build-order line 99 second half — first half `data_subject_requests` shipped in sub-unit A)
**Status:** spec — pending implementation plan
**Predecessor:** Wave 4 sub-unit A (the erasure cascade orchestrator) — shipped 2026-05-23, head `89eed8e`.

---

## 1. Scope

Ship v1 of GDPR / RO-Codul-Fiscal data retention enforcement:

- `retention_policies` table (per §13 §4.3) with the full v1 seed (11 forward-declared rows).
- `JOBS.compliance.retentionPurge` handler (pre-declared in `keys.ts` per Wave 1) wired at worker bootstrap.
- Nightly purge sweep at 04:30 UTC iterating every policy:
  - Skips silently when the `scope_table` doesn't exist yet (future-wave tables).
  - Hard-deletes or anonymises in 5000-row chunks, oldest first.
  - Writes one `AUDIT.compliance.retention_purge_run` row per policy per execution (NOT per affected row — avoids audit_logs self-purge loop).
  - Sentry-captures per-policy failures + continues to the next policy.
- New `AUDIT.compliance.retention_purge_run` action string.

### Out of scope

- **Live JSONB exception predicate execution** — only `marketing_consent_audit` has one in the seed, and that table doesn't exist yet (Wave 7). The engine parses the predicate but throws `NotImplementedError` if a live policy has one. Wave 7 extends the engine.
- **Anonymise action** — only `marketing_sends` uses it in the seed, and that table doesn't exist yet (Wave 7). The engine recognises `'anonymise'` but throws `NotImplementedError` until Wave 7 registers an anonymise-column list for marketing_sends.
- **archive_offline action** — no seed policy uses it. Engine throws if encountered.
- **Per-policy concurrency control** — the purge is sequential across policies in a single job execution. Per-table parallelism is a future optimisation.
- **DSR retention seed insertion** — covered by this unit (data_subject_requests row in the seed; sub-unit A documented it but deferred to here).

### Active purges expected in v1

| scope_table | shipped? | rows eligible on first run? |
|---|---|---|
| `audit_logs` | Wave 1 | 0 (oldest rows ~6 months; cutoff 7 years) |
| `transactional_email_log` | Wave 3 | 0 (cutoff 24 months; oldest rows ~weeks old) |
| `diner_pii_access_log` | Wave 3 | 0 (cutoff 24 months; recent ship) |
| `webhook_events` | Wave 1 | **YES** (cutoff 90 days; Wave 1 shipped ~6 months ago) |
| `data_subject_requests` | sub-unit A | 0 (cutoff 5 years; recent ship) |
| 6 future-wave tables | not yet | skipped silently |

The first nightly run will actually delete `webhook_events` rows older than 90 days. This is intended.

---

## 2. Data model

### 2.1 Migration 0032 — `retention_policies` table + full seed

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

-- No INSERT/UPDATE/DELETE policies — service-role only (seed inserts below + future migrations).

-- ─── Seed (locked) ──────────────────────────────────────────────────────
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

### 2.2 Drizzle schema

In `src/lib/db/schema.ts`, append:

```ts
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

### 2.3 Drizzle bookkeeping

After applying migration 0032 to prod via the manual `psql -f` convention, insert the bookkeeping row per `~/.claude/projects/-Users-henricktissink-Sauce-masaro/memory/deploy_setup.md`.

---

## 3. Purge engine

### 3.1 Module shape

`src/lib/compliance/retention.ts`:

```ts
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

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
  table: string;            // documented join target (informational)
  condition: string;        // human-readable label
  predicate_sql: string;    // raw SQL fragment; v1 throws if non-null
}

export interface RetentionDeps {
  db: PostgresJsDatabase<any>;
  recordAudit: (input: { action: string; subjectType: string; subjectId: string; actorRole: "system"; context: Record<string, unknown> }) => Promise<void>;
  sentryAlert: (msg: string, ctx: unknown) => void;
}

export interface PolicyResult {
  scopeTable: string;
  status: "purged" | "skipped_table_missing" | "skipped_no_handler" | "failed";
  rowsAffected: number;
  errorMessage?: string;
}

export function makeRunRetentionPurge(deps: RetentionDeps) {
  return async function runRetentionPurge(): Promise<PolicyResult[]>;
}

export const runRetentionPurge = makeRunRetentionPurge({ /* prod */ });
```

### 3.2 Algorithm

For each policy loaded from `retention_policies` (in unspecified order — execution order doesn't matter; policies are independent):

1. **Existence check** — `SELECT to_regclass($1) AS exists` with `$1 = scope_table`. If null → `{ status: 'skipped_table_missing', rowsAffected: 0 }` + no audit row.
2. **Predicate check** — if `exceptionPredicate` is not null → `{ status: 'skipped_no_handler', errorMessage: 'exception_predicate not implemented in v1' }`. No audit row; Sentry warn at `level: 'warning'`.
3. **Cutoff math** — `cutoff = now() - (policy.retentionPeriodDays || ' days')::interval` (computed in SQL, not JS, to avoid timezone drift).
4. **Action dispatch:**
   - `hard_delete` → §3.3
   - `anonymise` → §3.4
   - `archive_offline` → throw `Error("archive_offline not implemented")`; result `{ status: 'failed', errorMessage }`
5. **Audit** — on success, `recordAudit({ action: AUDIT.compliance.retention_purge_run, subjectType: 'retention_policy', subjectId: policy.id, actorRole: 'system', context: { scope_table, rows_affected, retention_period_days } })`. Written AFTER the DELETE/UPDATE completes (so the row count is final; the just-written audit row is irrelevant to its own cutoff because audit_logs has 7-year retention).
6. **Failure handling** — any exception → Sentry capture + result `{ status: 'failed', errorMessage }` + continue to next policy. NO recordAudit on failure (audit is success-only; Sentry is the failure channel).

Returns the array of `PolicyResult` (one per policy iterated). Useful for tests + worker logs.

### 3.3 Hard-delete handler

```sql
-- Loop until 0 rows deleted:
DELETE FROM <scope_table>
 WHERE id IN (
   SELECT id FROM <scope_table>
    WHERE <applies_to_column> < $cutoff
    ORDER BY <applies_to_column> ASC
    LIMIT 5000
 )
RETURNING id;
```

Each chunk is wrapped in its own transaction. Loop terminates when a DELETE returns 0 rows. Total rows deleted is summed across chunks.

**Important — table name + column name are NOT user-controlled**, they come from the `retention_policies` seed (locked at migration time). So splicing them into the SQL template literal is safe. BUT the engine should still validate they match `^[a-z_][a-z0-9_]*$` before splicing, as defence-in-depth in case a future migration adds a policy with a non-identifier value.

### 3.4 Anonymise stub

v1 has no live anonymise consumer (marketing_sends ships in Wave 7). The handler:

```ts
function anonymisePolicy(policy: RetentionPolicy, deps: RetentionDeps): PolicyResult {
  throw new Error(`anonymise not implemented for scope_table='${policy.scopeTable}' — Wave 7 ships marketing_sends + the columns-to-null registry`);
}
```

Wave 7 will: (a) add `src/lib/compliance/retention-anonymise-registry.ts` with `{ marketing_sends: ['recipient_email', 'recipient_phone'] }`, (b) replace this stub with a real handler that reads the registry.

### 3.5 Exception predicate stub

v1 has the seed value for `marketing_consent_audit` (per §4.3.1) but no live consumer. The engine throws if it encounters a non-null predicate during execution:

```ts
if (policy.exceptionPredicate !== null) {
  return { scopeTable: policy.scopeTable, status: "skipped_no_handler", rowsAffected: 0, errorMessage: "exception_predicate not implemented in v1" };
}
```

`marketing_consent_audit` doesn't exist yet, so the table-missing check at step 1 fires first — the predicate path is never reached in v1. The stub is defence-in-depth for an unexpected future state.

Wave 7 ships the predicate engine — likely a strict structured-AST parser (NOT raw SQL injection): the JSONB `condition` field maps to a known set of predicate types (`active_consent_exists`, etc.), each implemented in TypeScript as a parameterised SQL builder.

---

## 4. Job key + handler wrapper

### 4.1 Pre-declared key

`JOBS.compliance.retentionPurge: "compliance.retention-purge"` already exists in `src/lib/jobs/keys.ts`. No change here.

### 4.2 Handler wrapper

In `src/lib/jobs/handlers/compliance.ts`, append:

```ts
import { runRetentionPurge } from "@/lib/compliance/retention";

export async function handleRetentionPurge(): Promise<void> {
  await runRetentionPurge();
}
```

The handler takes no payload — the sweep iterates all policies.

### 4.3 Worker bootstrap

In `scripts/worker.ts`, after the existing compliance handler registrations:

```ts
import { handleRetentionPurge } from "@/lib/jobs/handlers/compliance";

await boss.work(JOBS.compliance.retentionPurge, async () => {
  await handleRetentionPurge();
});

await boss.schedule(JOBS.compliance.retentionPurge, "30 4 * * *");
console.log("[worker] retentionPurge scheduled (30 4 * * *)");
```

**Schedule rationale:** 04:30 UTC = 30 minutes after the daily `purgePseudonymised` (04:00) sweep + ~1.5 hours after the nightly `erasureVerify` (03:00). No contention with active partner traffic (RO peak 18:00-22:00).

---

## 5. AUDIT action — reuse existing

`AUDIT.compliance.retention_purge_run` is **already declared** in `src/lib/audit/actions.ts:151` (pre-existing). This unit reuses it directly — NO new AUDIT entry is added.

The architecture spec §8.1 step 5 refers to this action as "retention.purged" but the live registry uses `retention_purge_run`. The registry wins (foundations §16.2 convention). All `recordAudit` calls in this unit use `AUDIT.compliance.retention_purge_run`.

---

## 6. Tests

DI-seam factory pattern, matching all other compliance handlers.

`src/lib/compliance/__tests__/retention.test.ts`:

### Happy path
- 1 policy (`webhook_events`, 90d, hard_delete)
- Mock returns 3 rows from the DELETE (all chunks consumed in 1 pass)
- Assert: 1 audit row, `recordAudit` called with `action='compliance.retention_purged'`, context contains `scope_table='webhook_events'` + `rows_affected=3`
- Sentry not called

### Chunking
- 1 policy returning 5000 then 1 row (total 5001)
- Assert: 2 DELETE invocations, 1 audit row (not 2 — per-policy summary), `rows_affected: 5001`

### Missing table (forward-declared future-wave policy)
- 1 policy for `marketing_sends` (action='anonymise')
- `to_regclass` returns null
- Assert: result is `{ status: 'skipped_table_missing', rowsAffected: 0 }`, NO audit row, NO DELETE/UPDATE attempted

### Exception predicate present (non-null)
- 1 policy with `exceptionPredicate` set (e.g., marketing_consent_audit's predicate)
- Table existence check passes (mock to_regclass returns truthy)
- Assert: result is `{ status: 'skipped_no_handler' }`, Sentry warn called, NO DELETE attempted

### Action dispatch — anonymise stub
- 1 policy with `actionOnExpiry='anonymise'` + existing table
- Assert: result is `{ status: 'failed', errorMessage }` containing "not implemented"; Sentry warn called; cascade continues to next policy

### Action dispatch — archive_offline rejection
- 1 policy with `actionOnExpiry='archive_offline'` + existing table
- Assert: result is `{ status: 'failed', errorMessage }` containing "archive_offline not implemented"; Sentry warn called

### Per-policy failure isolation
- 2 policies: one throws mid-DELETE, second one succeeds
- Assert: 2 results returned, first `{ status: 'failed' }` + second `{ status: 'purged' }`, Sentry called once for the first, 1 audit row for the second

### Identifier validation
- 1 policy with `scopeTable='1nvalid; DROP TABLE diners;'` (synthetic; would never appear in the seed)
- Assert: engine throws or returns `{ status: 'failed' }` with "invalid scope_table identifier" message; NO query against the malicious name is executed

### audit_logs self-purge ordering
- 1 policy for `audit_logs` (2555d, hard_delete)
- Mock returns 2 rows deleted
- Assert: `recordAudit` call happens AFTER `db.execute(DELETE)` (validate by tracking call order); audit row written for the purge itself does NOT appear in the count of rows deleted

---

## 7. File layout

### New files
```
drizzle/migrations/0032_retention_policies.sql
src/lib/compliance/retention.ts
src/lib/compliance/__tests__/retention.test.ts
```

### Modified files
```
drizzle/migrations/meta/_journal.json       # entry 32
src/lib/db/schema.ts                        # retentionPolicies table
(src/lib/audit/actions.ts NOT modified — AUDIT.compliance.retention_purge_run already exists)
src/lib/jobs/handlers/compliance.ts         # handleRetentionPurge wrapper
scripts/worker.ts                           # boss.work + boss.schedule
```

---

## 8. Implementation phasing

1. **Schema + seed** — migration 0032 + schema.ts + drizzle bookkeeping (one commit for SQL, one for schema.ts).
2. **Purge engine + tests** — retention.ts + retention.test.ts + AUDIT action.
3. **Handler wrapper + worker registration** — handleRetentionPurge in jobs/handlers/compliance.ts + worker.ts schedule.
4. **Prod migration apply** + drizzle bookkeeping + Coolify redeploy trigger.
5. **build-order annotation** + push.

Per Wave 3 + sub-unit A convention: 2-commit pattern for the migration-bearing phase. Other phases are 1 commit each. Total ~5-6 commits.

---

## 9. Open follow-ups (post-v1)

1. **Anonymise engine for Wave 7** — when `marketing_sends` ships, that unit adds `src/lib/compliance/retention-anonymise-registry.ts` mapping `scope_table → string[]` of PII columns to null. The anonymise stub becomes a real handler that reads the registry + executes per-chunk `UPDATE ... SET <columns> = NULL ... LIMIT 5000`.
2. **Predicate engine for Wave 7** — when `marketing_consent_audit` ships, that unit extends the engine with a structured-AST parser. The JSONB `condition` field maps to a registry of known predicate kinds; each kind has a parameterised SQL builder. NO raw SQL injection from the predicate_sql field.
3. **archive_offline action** — no v1 use case. If billing_audit_log retention ever needs "move to S3 cold storage" semantics, a future unit ships that handler.
4. **Per-table scheduling** — currently the nightly job iterates all policies sequentially. If purge volume on `webhook_events` (the only actively-purging table in v1) grows large enough to delay other policies, split into per-table scheduled jobs.
5. **Retention policy admin UI** — `/admin/(gated)/retention-policies` page to list + edit policies + see last-run results. Not in v1 scope; policies are locked at migration time.
6. **Per-policy dry-run mode** — useful for first-run verification on new tables. Not in v1.

---

## 10. Acceptance criteria

- Migration 0032 applied to prod with drizzle bookkeeping row inserted.
- `retention_policies` populated with all 11 seed rows.
- `runRetentionPurge` tests green (~9 tests covering happy path, chunking, missing-table skip, predicate stub, anonymise stub, archive stub, failure isolation, identifier validation, audit ordering).
- `JOBS.compliance.retentionPurge` registered at worker bootstrap.
- `boss.schedule(JOBS.compliance.retentionPurge, "30 4 * * *")` active.
- First nightly run completes successfully against prod: webhook_events rows older than 90 days deleted; one `AUDIT.compliance.retention_purge_run` row per touched policy.
- `npx tsc --noEmit` clean; `npm run lint` no new errors / warnings beyond baseline.
- `build-order.md` line 99 marked `[x]` with shipped-date annotation.
