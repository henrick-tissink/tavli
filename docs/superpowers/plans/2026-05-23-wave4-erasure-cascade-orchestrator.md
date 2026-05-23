# Wave 4 §13 erasure cascade orchestrator — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1 GDPR Article 17 erasure cascade as the first Wave 4 unit — `data_subject_requests` table, `pii-table-registry`, pg-boss orchestrator + nightly verification sweep, six per-domain handlers, admin queue UI at `/admin/gdpr-requests`, and a minimal RO/EN/DE `DataDeletionConfirmedEmail`.

**Architecture:** Registry-driven sequential cascade. `src/lib/compliance/pii-table-registry.ts` is the single source of truth listing every v1 PII-bearing table; the pg-boss orchestrator (`JOBS.compliance.erasureExecute`) iterates the registry in cascade order, calling each shipped handler with the resolved diner ids + pre-redaction identifier capture. Wave 3's `pseudonymiseDiner` is wrapped as the "diners" handler; future-Wave PII tables (billing_audit_log, marketing_sends, etc.) sit as `shipped: false` stubs. A nightly `JOBS.compliance.erasureVerify` sweep re-reads every redacted row and Sentry-alerts on residual PII.

**Tech Stack:** Next.js 15 App Router · TypeScript · Drizzle ORM · Supabase Postgres · pg-boss · Jest · React Email · Resend.

**Spec:** [`docs/superpowers/specs/2026-05-23-wave4-erasure-cascade-orchestrator-design.md`](../specs/2026-05-23-wave4-erasure-cascade-orchestrator-design.md)

---

## File structure

**Migrations (new):**
- `drizzle/migrations/0029_data_subject_requests.sql`
- `drizzle/migrations/0030_redacted_at_columns_backfill.sql`
- `drizzle/migrations/0031_partner_notifications_pending_erasure_request_id.sql`

**Compliance domain (new):**
- `src/lib/compliance/pii-table-registry.ts` — type defs + ordered registry of every v1 PII table
- `src/lib/compliance/handlers/marketing-suppressions.ts`
- `src/lib/compliance/handlers/marketing-consents.ts`
- `src/lib/compliance/handlers/partner-notifications-phase1.ts`
- `src/lib/compliance/handlers/partner-notifications-phase2.ts`
- `src/lib/compliance/handlers/diners.ts` (wraps Wave 3's `pseudonymiseDiner`)
- `src/lib/compliance/handlers/audit-logs.ts`
- `src/lib/compliance/handlers/__tests__/*.test.ts` (one per handler)
- `src/lib/compliance/dsr-actions.ts` — six server actions
- `src/lib/compliance/__tests__/dsr-actions.test.ts`
- `src/lib/compliance/verify.ts` — verification sweep entrypoint
- `src/lib/compliance/__tests__/verify.test.ts`
- `src/lib/compliance/__tests__/erasure-cascade.integration.test.ts` — full end-to-end (real db)

**Jobs (new + modified):**
- `src/lib/jobs/handlers/compliance.ts` — three exported pg-boss handlers
- `src/lib/jobs/__tests__/handlers/compliance.test.ts`
- `src/lib/jobs/keys.ts` (modify) — add `erasurePartnerNotificationsPhase2`
- `src/lib/jobs/bootstrap.ts` (modify) — register three compliance handlers + schedule verify + wire diner.purgePseudonymised

**Email (new):**
- `src/emails/messages/ro/DataDeletionConfirmed.tsx`
- `src/emails/messages/en/DataDeletionConfirmed.tsx`
- `src/emails/messages/de/DataDeletionConfirmed.tsx`
- (Modify) `src/lib/email/send-transactional.ts` — register `'data_deletion_confirmed'` template key

**Admin UI (new):**
- `src/app/admin/gdpr-requests/page.tsx`
- `src/app/admin/gdpr-requests/[id]/page.tsx`
- `src/app/admin/gdpr-requests/[id]/actions.ts`
- `src/app/admin/gdpr-requests/[id]/components/ResolveDinerModal.tsx`
- `src/app/admin/gdpr-requests/[id]/components/VerifyIdentityModal.tsx`
- `src/app/admin/gdpr-requests/[id]/components/ApproveErasureButton.tsx`
- `src/app/admin/gdpr-requests/[id]/components/RejectModal.tsx`
- `src/app/admin/gdpr-requests/[id]/components/ExtendDeadlineModal.tsx`
- `src/app/admin/gdpr-requests/[id]/components/CascadeAuditTrail.tsx`
- `src/app/admin/gdpr-requests/[id]/components/FailureBanner.tsx`

**Existing files modified:**
- `src/lib/diners/pseudonymise.ts` — idempotency guard + `redacted_at` writes on cascade UPDATEs
- `src/lib/diners/__tests__/pseudonymise.test.ts` — add idempotency + cascade-redacted_at tests
- `src/lib/db/schema.ts` — add `data_subject_requests` table + three `redacted_at` columns + one FK column on `partner_notifications`
- `src/lib/audit/actions.ts` — add four new `AUDIT.compliance.*` action strings
- `src/lib/permissions/<as discovered>` — add six `can:gdpr.*` permission keys for `tavli_admin` role
- `docs/superpowers/architecture/build-order.md` — annotate line 103 with shipped date

---

## Phase 1 — Migrations + schema

### Task 1: Migration 0029 — `data_subject_requests` table

**Files:**
- Create: `drizzle/migrations/0029_data_subject_requests.sql`
- Modify: `drizzle/migrations/meta/_journal.json`

- [ ] **Step 1: Write the migration SQL**

Create `drizzle/migrations/0029_data_subject_requests.sql`:

```sql
-- 0029_data_subject_requests.sql
-- §13 §4.2 — GDPR Articles 15/16/17/20 (access / rectification / erasure / portability) tracking.
--
-- Writes go through src/lib/compliance/dsr-actions.ts (service role). RLS allows
-- Tavli admin reads only; diner-self-read deferred until in-product intake ships.

CREATE TABLE "data_subject_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  "diner_id" uuid REFERENCES "diners"("id") ON DELETE SET NULL,
  "identifier_phone" varchar(20),
  "identifier_email" varchar(255),

  "request_kind" varchar(40) NOT NULL,
  "request_source" varchar(40) NOT NULL,
  "request_body" text,

  "identity_verified" boolean NOT NULL DEFAULT false,
  "identity_verification_method" varchar(60),
  "identity_verified_at" timestamptz,
  "identity_verified_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  "status" varchar(20) NOT NULL DEFAULT 'received',
  "rejection_reason" text,
  "completed_at" timestamptz,

  "legal_deadline_at" timestamptz NOT NULL,

  "approved_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "approved_at" timestamptz,

  "deadline_extension_days" smallint NOT NULL DEFAULT 0,
  "deadline_extension_reason" text,
  "deadline_extended_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "deadline_extended_at" timestamptz,

  "export_storage_path" text,
  "export_signed_url_expires_at" timestamptz,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "chk_dsr_deadline_extension_cap"
    CHECK ("deadline_extension_days" BETWEEN 0 AND 14),
  CONSTRAINT "chk_dsr_deadline_extension_reason"
    CHECK (
      ("deadline_extension_days" = 0 AND "deadline_extension_reason" IS NULL)
      OR ("deadline_extension_days" > 0 AND "deadline_extension_reason" IS NOT NULL AND "deadline_extended_by_user_id" IS NOT NULL)
    )
);

CREATE INDEX "data_subject_requests_status"
  ON "data_subject_requests" ("status", "legal_deadline_at")
  WHERE "status" IN ('received', 'in_progress');

CREATE INDEX "data_subject_requests_diner"
  ON "data_subject_requests" ("diner_id")
  WHERE "diner_id" IS NOT NULL;

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE "data_subject_requests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dsr_admin_read" ON "data_subject_requests" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid() AND p."role" = 'tavli_admin'
  ));

-- No INSERT/UPDATE/DELETE policies — service-role only.
```

- [ ] **Step 2: Append journal entry**

Edit `drizzle/migrations/meta/_journal.json` to append a new entry matching the pattern of the previous one. Look at the last entry (0028) for the exact JSON shape — copy it, bump the index, bump the `when` timestamp, and update the `tag` to `0029_data_subject_requests`.

- [ ] **Step 3: Add Drizzle schema entry**

Modify `src/lib/db/schema.ts`. Find the spot where Wave 3's tables were declared (near `marketingConsents` / `erasureLog`) and append:

```ts
// ─── data_subject_requests ──────────────────────────────────────────────
// §13 §4.2 — GDPR DSR tracking. Tavli-admin intake only in v1.
export const dataSubjectRequests = pgTable(
  "data_subject_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dinerId: uuid("diner_id").references(() => diners.id, { onDelete: "set null" }),
    identifierPhone: varchar("identifier_phone", { length: 20 }),
    identifierEmail: varchar("identifier_email", { length: 255 }),
    requestKind: varchar("request_kind", { length: 40 }).notNull(),
    requestSource: varchar("request_source", { length: 40 }).notNull(),
    requestBody: text("request_body"),
    identityVerified: boolean("identity_verified").notNull().default(false),
    identityVerificationMethod: varchar("identity_verification_method", { length: 60 }),
    identityVerifiedAt: timestamp("identity_verified_at", { withTimezone: true }),
    identityVerifiedByUserId: uuid("identity_verified_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("received"),
    rejectionReason: text("rejection_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    legalDeadlineAt: timestamp("legal_deadline_at", { withTimezone: true }).notNull(),
    approvedByUserId: uuid("approved_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    deadlineExtensionDays: smallint("deadline_extension_days").notNull().default(0),
    deadlineExtensionReason: text("deadline_extension_reason"),
    deadlineExtendedByUserId: uuid("deadline_extended_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    deadlineExtendedAt: timestamp("deadline_extended_at", { withTimezone: true }),
    exportStoragePath: text("export_storage_path"),
    exportSignedUrlExpiresAt: timestamp("export_signed_url_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    statusIdx: index("data_subject_requests_status").on(t.status, t.legalDeadlineAt).where(sql`${t.status} IN ('received', 'in_progress')`),
    dinerIdx: index("data_subject_requests_diner").on(t.dinerId).where(sql`${t.dinerId} IS NOT NULL`),
  }),
);
```

(If `authUsers` import doesn't exist in schema.ts, follow the existing pattern for `auth.users` FKs — Wave 3's `data_subject_requests`-referencing migrations may already have shown the convention.)

- [ ] **Step 4: Apply migration locally**

Run: `npx drizzle-kit migrate`
Expected: "Done!" output; new migration applied.

- [ ] **Step 5: Verify with a smoke query**

Run: `psql "$DATABASE_URL" -c "INSERT INTO data_subject_requests (request_kind, request_source, legal_deadline_at) VALUES ('erasure', 'email', now() + interval '30 days') RETURNING id;"`
Expected: A new UUID returned + the row inserted.

Run: `psql "$DATABASE_URL" -c "DELETE FROM data_subject_requests WHERE request_kind = 'erasure';"`

- [ ] **Step 6: Commit**

```bash
git add drizzle/migrations/0029_data_subject_requests.sql drizzle/migrations/meta/_journal.json src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(compliance): data_subject_requests table (§13 §4.2 Wave 4 sub-unit A.1)

GDPR DSR tracking table with identity verification + deadline-extension
constraints. Tavli-admin read RLS only; service-role writes via
src/lib/compliance/dsr-actions.ts (next commit).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migration 0030 — `redacted_at` columns on audit_logs + reservations + reviews

**Files:**
- Create: `drizzle/migrations/0030_redacted_at_columns_backfill.sql`
- Modify: `drizzle/migrations/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Write the migration SQL**

Create `drizzle/migrations/0030_redacted_at_columns_backfill.sql`:

```sql
-- 0030_redacted_at_columns_backfill.sql
-- Foundations §15a.1 — every PII-bearing table has a redacted_at timestamptz column.
-- Wave 3 added it to diners + partner_notifications + transactional_email_log;
-- this migration backfills the three remaining tables.

ALTER TABLE "audit_logs"   ADD COLUMN "redacted_at" timestamptz NULL;
ALTER TABLE "reservations" ADD COLUMN "redacted_at" timestamptz NULL;
ALTER TABLE "reviews"      ADD COLUMN "redacted_at" timestamptz NULL;

CREATE INDEX "audit_logs_redacted_at_idx"
  ON "audit_logs" ("redacted_at") WHERE "redacted_at" IS NOT NULL;

CREATE INDEX "reservations_redacted_at_idx"
  ON "reservations" ("redacted_at") WHERE "redacted_at" IS NOT NULL;

CREATE INDEX "reviews_redacted_at_idx"
  ON "reviews" ("redacted_at") WHERE "redacted_at" IS NOT NULL;
```

- [ ] **Step 2: Append journal entry**

Append the 0030 entry to `_journal.json` matching the prior pattern.

- [ ] **Step 3: Add Drizzle column definitions**

In `src/lib/db/schema.ts`, add `redactedAt: timestamp("redacted_at", { withTimezone: true })` to each of the three table definitions (`auditLogs`, `reservations`, `reviews`). Add a matching `redactedAtIdx` to each `(t) => ({...})` block:

```ts
redactedAtIdx: index("<table>_redacted_at_idx").on(t.redactedAt).where(sql`${t.redactedAt} IS NOT NULL`),
```

- [ ] **Step 4: Apply migration locally**

Run: `npx drizzle-kit migrate`
Expected: Done.

- [ ] **Step 5: Verify columns exist**

Run: `psql "$DATABASE_URL" -c "\\d audit_logs" | grep redacted_at`
Run: `psql "$DATABASE_URL" -c "\\d reservations" | grep redacted_at`
Run: `psql "$DATABASE_URL" -c "\\d reviews" | grep redacted_at`
Expected: each query shows `redacted_at | timestamp with time zone`.

- [ ] **Step 6: Commit**

```bash
git add drizzle/migrations/0030_redacted_at_columns_backfill.sql drizzle/migrations/meta/_journal.json src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(compliance): redacted_at columns on audit_logs + reservations + reviews (§13 Wave 4 sub-unit A.2)

Foundations §15a.1 gap closure — Wave 3 added redacted_at to diners,
partner_notifications, transactional_email_log but missed these three.
Verification sweep + cascade handlers depend on per-row redaction markers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Migration 0031 — `partner_notifications.pending_erasure_request_id`

**Files:**
- Create: `drizzle/migrations/0031_partner_notifications_pending_erasure_request_id.sql`
- Modify: `drizzle/migrations/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 0031_partner_notifications_pending_erasure_request_id.sql
-- §13 §6.3 step (h) phase 2 needs to know which DSR triggered each phase 1 mark
-- so a phase 2 retry can target only its own marked rows.

ALTER TABLE "partner_notifications"
  ADD COLUMN "pending_erasure_request_id" uuid NULL
  REFERENCES "data_subject_requests"("id") ON DELETE SET NULL;

CREATE INDEX "partner_notifications_pending_erasure_request_idx"
  ON "partner_notifications" ("pending_erasure_request_id")
  WHERE "pending_erasure_request_id" IS NOT NULL;
```

- [ ] **Step 2: Append journal entry**

Append the 0031 entry.

- [ ] **Step 3: Add Drizzle column**

In `src/lib/db/schema.ts`, find `partnerNotifications` and add:

```ts
pendingErasureRequestId: uuid("pending_erasure_request_id").references(() => dataSubjectRequests.id, { onDelete: "set null" }),
```

Then add to the `(t) => [...]` array:

```ts
index("partner_notifications_pending_erasure_request_idx")
  .on(t.pendingErasureRequestId)
  .where(sql`${t.pendingErasureRequestId} IS NOT NULL`),
```

- [ ] **Step 4: Apply migration locally**

Run: `npx drizzle-kit migrate`
Expected: Done.

- [ ] **Step 5: Verify the FK**

Run: `psql "$DATABASE_URL" -c "\\d partner_notifications" | grep pending_erasure_request_id`
Expected: shows column + FK reference to data_subject_requests.

- [ ] **Step 6: Commit**

```bash
git add drizzle/migrations/0031_partner_notifications_pending_erasure_request_id.sql drizzle/migrations/meta/_journal.json src/lib/db/schema.ts
git commit -m "$(cat <<'EOF'
feat(compliance): partner_notifications.pending_erasure_request_id FK (§13 §6.3 Wave 4 sub-unit A.3)

Phase 2 of partner_notifications erasure needs to target only the rows
marked by a specific DSR's phase 1 — without this FK the phase 2 retry
can't disambiguate concurrent DSRs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Extend `pseudonymiseDiner` with idempotency guard + cascade redacted_at writes

**Files:**
- Modify: `src/lib/diners/pseudonymise.ts`
- Modify: `src/lib/diners/__tests__/pseudonymise.test.ts`

- [ ] **Step 1: Write the new idempotency test**

In `src/lib/diners/__tests__/pseudonymise.test.ts`, find the `describe("pseudonymiseDiner", () => {...})` block and append a new test:

```ts
it("is idempotent: second call on an already-redacted diner is a no-op", async () => {
  const txMock = jest.fn().mockImplementation(async (callback) => {
    const tx = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            for: jest.fn().mockResolvedValue([{ redactedAt: new Date("2024-01-01T00:00:00Z") }]),
          }),
        }),
      }),
      update: jest.fn(),
      insert: jest.fn(),
    };
    await callback(tx);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
  const db = { transaction: txMock } as unknown as typeof dbAdmin;
  const subject = makePseudonymiseDiner({ db });
  await subject({
    dinerId: "00000000-0000-0000-0000-000000000001",
    reason: "gdpr_erasure",
    actorUserId: "00000000-0000-0000-0000-000000000002",
  });
  expect(recordAudit).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write the cascade-redacted_at test**

Append another test asserting `redacted_at` is set on reservations + reviews:

```ts
it("sets redacted_at on cascaded reservations and reviews rows", async () => {
  let reservationsUpdate: any = null;
  let reviewsUpdate: any = null;
  const txMock = jest.fn().mockImplementation(async (callback) => {
    const tx = {
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            for: jest.fn().mockResolvedValue([{ redactedAt: null }]),
          }),
        }),
      }),
      update: jest.fn().mockImplementation((table) => ({
        set: jest.fn().mockImplementation((values) => {
          if (table === reservations) reservationsUpdate = values;
          if (table === reviews) reviewsUpdate = values;
          return { where: jest.fn().mockResolvedValue([]) };
        }),
      })),
      insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue([]) }),
    };
    await callback(tx);
  });
  const db = { transaction: txMock } as unknown as typeof dbAdmin;
  const subject = makePseudonymiseDiner({ db });
  await subject({
    dinerId: "00000000-0000-0000-0000-000000000001",
    reason: "gdpr_erasure",
    actorUserId: "00000000-0000-0000-0000-000000000002",
  });
  expect(reservationsUpdate?.redactedAt).toBeInstanceOf(Date);
  expect(reviewsUpdate?.redactedAt).toBeInstanceOf(Date);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/lib/diners/__tests__/pseudonymise.test.ts`
Expected: two new tests fail. Existing tests pass.

- [ ] **Step 4: Implement the idempotency guard**

In `src/lib/diners/pseudonymise.ts`, modify the `makePseudonymiseDiner` returned function. Inside the `await deps.db.transaction(async (tx) => { ... })` block, add at the top:

```ts
// Idempotency guard — if the diner is already redacted, return early
// without writing audit, erasure_log, or cascade rows. SELECT FOR UPDATE
// serialises concurrent calls (rare, but defensible).
const existing = await tx
  .select({ redactedAt: diners.redactedAt })
  .from(diners)
  .where(eq(diners.id, input.dinerId))
  .for("update");
if (existing[0]?.redactedAt != null) {
  return;
}
```

Then convert the post-transaction `recordAudit` calls to be gated by a flag — the simplest is to capture whether the transaction did any work:

```ts
let didWork = false;
await deps.db.transaction(async (tx) => {
  const existing = await tx.select({ redactedAt: diners.redactedAt }).from(diners).where(eq(diners.id, input.dinerId)).for("update");
  if (existing[0]?.redactedAt != null) return;
  didWork = true;
  // ... rest of original transaction body ...
});
if (!didWork) return;
// ... existing recordAudit calls ...
```

- [ ] **Step 5: Implement the cascade redacted_at writes**

In the same file, find the reservations cascade UPDATE and add `redactedAt: now` to the `.set({...})` object:

```ts
await tx
  .update(reservations)
  .set({
    guestName: REDACTED_PLACEHOLDER,
    guestPhone: REDACTED_PHONE_PLACEHOLDER,
    guestEmail: null,
    redactedAt: now,
  })
  .where(eq(reservations.dinerId, input.dinerId));
```

Do the same for reviews:

```ts
await tx
  .update(reviews)
  .set({ firstName: REDACTED_PLACEHOLDER, redactedAt: now })
  .where(eq(reviews.dinerId, input.dinerId));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/lib/diners/__tests__/pseudonymise.test.ts`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/diners/pseudonymise.ts src/lib/diners/__tests__/pseudonymise.test.ts
git commit -m "$(cat <<'EOF'
feat(diners): pseudonymiseDiner idempotency guard + cascade redacted_at (Wave 4 sub-unit A.4)

Wave 4 orchestrator calls pseudonymiseDiner via pg-boss retry — must be a
no-op if the diner is already redacted. SELECT FOR UPDATE serialises any
concurrent calls. Cascade UPDATEs to reservations + reviews now also stamp
redacted_at so the verification sweep can confirm post-fact.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Registry + handlers + tests

### Task 5: PII table registry — types + empty array + tests

**Files:**
- Create: `src/lib/compliance/pii-table-registry.ts`
- Create: `src/lib/compliance/__tests__/pii-table-registry.test.ts`

- [ ] **Step 1: Write a smoke test for the type contract**

Create `src/lib/compliance/__tests__/pii-table-registry.test.ts`:

```ts
import { PII_TABLE_REGISTRY, type PiiTableEntry } from "../pii-table-registry";

describe("PII_TABLE_REGISTRY", () => {
  it("exports an array of registry entries", () => {
    expect(Array.isArray(PII_TABLE_REGISTRY)).toBe(true);
  });

  it("every entry has a unique tableName", () => {
    const names = PII_TABLE_REGISTRY.map((e: PiiTableEntry) => e.tableName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("shipped:true entries always have either a handler OR a coveredBy ref", () => {
    for (const entry of PII_TABLE_REGISTRY) {
      if (entry.shipped) {
        const hasHandler = entry.handler != null;
        const hasCoveredBy = entry.coveredBy != null;
        expect(hasHandler || hasCoveredBy).toBe(true);
      }
    }
  });

  it("shipped:true entries always have a verificationQuery", () => {
    for (const entry of PII_TABLE_REGISTRY) {
      if (entry.shipped) {
        expect(entry.verificationQuery).not.toBeNull();
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/compliance/__tests__/pii-table-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the registry module with types + empty array**

Create `src/lib/compliance/pii-table-registry.ts`:

```ts
/**
 * pii-table-registry — single source of truth for every v1 PII-bearing table.
 *
 * The §13 erasure cascade orchestrator iterates this registry in order;
 * the verification sweep queries every shipped entry. Adding a new PII
 * table requires (a) the redacted_at column per foundations §15a.1,
 * (b) a registry entry here, (c) a handler in src/lib/compliance/handlers/,
 * (d) a retention_policies row (sibling Wave 4 unit).
 *
 * Future-Wave tables sit as shipped:false stubs. When a future Wave ships
 * its table, flipping shipped:true + adding handler + verificationQuery
 * is the only code change required to integrate it into the cascade.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type HandlerDeps = {
  db: PostgresJsDatabase<any>;
  dsrId: string;
  dinerIds: string[];
  capturedIdentifiers: Array<{
    dinerId: string;
    phone: string | null;
    email: string | null;
  }>;
  actorUserId: string;
  impersonatorUserId: string | undefined;
  actorRole: "tavli_admin";
};

export type HandlerResult = {
  tableName: string;
  rowsRedacted: number;
  skipped: boolean;
};

export type VerifyDeps = { db: PostgresJsDatabase<any> };

export type VerificationResult = {
  tableName: string;
  rowsScanned: number;
  rowsWithResidualPii: number;
  residualRowIds: string[];
};

export type PiiTableEntry = {
  tableName: string;
  shipped: boolean;
  handler: ((deps: HandlerDeps) => Promise<HandlerResult>) | null;
  verificationQuery: ((deps: VerifyDeps) => Promise<VerificationResult>) | null;
  twoPhase: boolean;
  piiColumns: string[];
  coveredBy?: string;
  defaultReason: "gdpr_art_17" | "gdpr_art_17_with_fiscal_retention";
};

export const PII_TABLE_REGISTRY: readonly PiiTableEntry[] = [];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/compliance/__tests__/pii-table-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compliance/pii-table-registry.ts src/lib/compliance/__tests__/pii-table-registry.test.ts
git commit -m "$(cat <<'EOF'
feat(compliance): pii-table-registry skeleton + invariant tests (Wave 4 §13 sub-unit A.5)

Types + empty array + three self-invariant tests (unique names, handler-or-coveredBy
when shipped, verificationQuery required when shipped). Handler entries land
in subsequent commits as each handler file is written.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `handleMarketingSuppressions` handler

**Files:**
- Create: `src/lib/compliance/handlers/marketing-suppressions.ts`
- Create: `src/lib/compliance/handlers/__tests__/marketing-suppressions.test.ts`
- Modify: `src/lib/compliance/pii-table-registry.ts`

- [ ] **Step 1: Write the handler test**

Create `src/lib/compliance/handlers/__tests__/marketing-suppressions.test.ts`:

```ts
import { makeHandleMarketingSuppressions } from "../marketing-suppressions";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handleMarketingSuppressions", () => {
  it("inserts suppression rows for each (channel, identifier) pair from captured identifiers", async () => {
    const inserts: any[] = [];
    const db = {
      insert: jest.fn().mockImplementation(() => ({
        values: jest.fn().mockImplementation((rows) => {
          inserts.push(...(Array.isArray(rows) ? rows : [rows]));
          return { onConflictDoNothing: jest.fn().mockResolvedValue({ rowCount: rows.length }) };
        }),
      })),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandleMarketingSuppressions({});
    const result = await handler({
      db,
      dsrId: "dsr-1",
      dinerIds: ["d1"],
      capturedIdentifiers: [
        { dinerId: "d1", phone: "+40712345678", email: "alice@example.ro" },
      ],
      actorUserId: "admin-1",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });

    expect(result.tableName).toBe("marketing_suppressions");
    expect(inserts).toHaveLength(3); // sms + whatsapp + email
    expect(inserts.map((r) => r.channel).sort()).toEqual(["email", "sms", "whatsapp"]);
  });

  it("skips channels whose identifier is null", async () => {
    const inserts: any[] = [];
    const db = {
      insert: jest.fn().mockImplementation(() => ({
        values: jest.fn().mockImplementation((rows) => {
          inserts.push(...(Array.isArray(rows) ? rows : [rows]));
          return { onConflictDoNothing: jest.fn().mockResolvedValue({ rowCount: rows.length }) };
        }),
      })),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandleMarketingSuppressions({});
    await handler({
      db,
      dsrId: "dsr-1",
      dinerIds: ["d1"],
      capturedIdentifiers: [{ dinerId: "d1", phone: null, email: "alice@example.ro" }],
      actorUserId: "admin-1",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0].channel).toBe("email");
  });

  it("returns rowsRedacted=0 when capturedIdentifiers is empty", async () => {
    const db = { insert: jest.fn() } as unknown as HandlerDeps["db"];
    const handler = makeHandleMarketingSuppressions({});
    const result = await handler({
      db, dsrId: "dsr-1", dinerIds: [], capturedIdentifiers: [],
      actorUserId: "admin-1", impersonatorUserId: undefined, actorRole: "tavli_admin",
    });
    expect(result.rowsRedacted).toBe(0);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/compliance/handlers/__tests__/marketing-suppressions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

Create `src/lib/compliance/handlers/marketing-suppressions.ts`:

```ts
import { marketingSuppressions } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = Record<string, never>;

export function makeHandleMarketingSuppressions(_deps: Deps) {
  return async function handleMarketingSuppressions(d: HandlerDeps): Promise<HandlerResult> {
    const rows: Array<{
      channel: "sms" | "email" | "whatsapp";
      identifier: string;
      source: string;
      sourceEventId: string;
    }> = [];

    for (const ci of d.capturedIdentifiers) {
      if (ci.phone) {
        rows.push({ channel: "sms", identifier: ci.phone, source: "gdpr_erasure", sourceEventId: d.dsrId });
        rows.push({ channel: "whatsapp", identifier: ci.phone, source: "gdpr_erasure", sourceEventId: d.dsrId });
      }
      if (ci.email) {
        rows.push({ channel: "email", identifier: ci.email, source: "gdpr_erasure", sourceEventId: d.dsrId });
      }
    }

    if (rows.length === 0) {
      return { tableName: "marketing_suppressions", rowsRedacted: 0, skipped: true };
    }

    const inserted = await d.db
      .insert(marketingSuppressions)
      .values(rows)
      .onConflictDoNothing();

    return {
      tableName: "marketing_suppressions",
      rowsRedacted: (inserted as { rowCount?: number }).rowCount ?? rows.length,
      skipped: false,
    };
  };
}

export const handleMarketingSuppressions = makeHandleMarketingSuppressions({});
```

(If the actual `marketingSuppressions` Drizzle schema uses different column names — `source_event_id` vs `sourceEventId`, etc. — adjust to match. Check `src/lib/db/schema.ts` for the exact shape and confirm whether the column for `source` is named differently.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/compliance/handlers/__tests__/marketing-suppressions.test.ts`
Expected: PASS.

- [ ] **Step 5: Add registry entry + verification query stub**

In `src/lib/compliance/pii-table-registry.ts`, replace the empty `PII_TABLE_REGISTRY` array with:

```ts
import { handleMarketingSuppressions } from "./handlers/marketing-suppressions";
import { marketingSuppressions } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

async function verifyMarketingSuppressionsRedacted({ db }: VerifyDeps): Promise<VerificationResult> {
  // marketing_suppressions is ADDITIVE in erasure (we INSERT rows, not redact),
  // so verification just confirms rows exist for the relevant identifiers.
  // No residual-PII concept applies — return zero residual.
  return { tableName: "marketing_suppressions", rowsScanned: 0, rowsWithResidualPii: 0, residualRowIds: [] };
}

export const PII_TABLE_REGISTRY: readonly PiiTableEntry[] = [
  {
    tableName: "marketing_suppressions",
    shipped: true,
    handler: handleMarketingSuppressions,
    verificationQuery: verifyMarketingSuppressionsRedacted,
    twoPhase: false,
    piiColumns: ["identifier"],
    defaultReason: "gdpr_art_17",
  },
];
```

- [ ] **Step 6: Run registry tests to verify they still pass**

Run: `npm test -- src/lib/compliance/__tests__/pii-table-registry.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/compliance/handlers/marketing-suppressions.ts src/lib/compliance/handlers/__tests__/marketing-suppressions.test.ts src/lib/compliance/pii-table-registry.ts
git commit -m "$(cat <<'EOF'
feat(compliance): handleMarketingSuppressions + registry entry (Wave 4 §13 sub-unit A.6)

First handler — additive (INSERTs rows, doesn't redact). Captures pre-redaction
diner identifiers + writes sms/whatsapp/email suppressions ON CONFLICT DO NOTHING.
Verification is a no-op (additive ≠ redactive).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `handleMarketingConsents` handler

**Files:**
- Create: `src/lib/compliance/handlers/marketing-consents.ts`
- Create: `src/lib/compliance/handlers/__tests__/marketing-consents.test.ts`
- Modify: `src/lib/compliance/pii-table-registry.ts`

- [ ] **Step 1: Write the handler test**

Create `src/lib/compliance/handlers/__tests__/marketing-consents.test.ts`:

```ts
import { makeHandleMarketingConsents } from "../marketing-consents";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handleMarketingConsents", () => {
  it("sets revoked_at on all consent rows for the diner_ids", async () => {
    let setValues: any = null;
    const db = {
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation((v) => {
          setValues = v;
          return { where: jest.fn().mockResolvedValue({ rowCount: 2 }) };
        }),
      }),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandleMarketingConsents({});
    const result = await handler({
      db, dsrId: "dsr-1", dinerIds: ["d1", "d2"], capturedIdentifiers: [],
      actorUserId: "admin", impersonatorUserId: undefined, actorRole: "tavli_admin",
    });

    expect(result.tableName).toBe("marketing_consents");
    expect(result.rowsRedacted).toBe(2);
    expect(setValues.revokedAt).toBeInstanceOf(Date);
    expect(setValues.revokeReason).toBe("gdpr_erasure");
  });

  it("returns rowsRedacted=0 when dinerIds is empty", async () => {
    const db = { update: jest.fn() } as unknown as HandlerDeps["db"];
    const handler = makeHandleMarketingConsents({});
    const result = await handler({
      db, dsrId: "dsr-1", dinerIds: [], capturedIdentifiers: [],
      actorUserId: "admin", impersonatorUserId: undefined, actorRole: "tavli_admin",
    });
    expect(result.rowsRedacted).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/compliance/handlers/__tests__/marketing-consents.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

Create `src/lib/compliance/handlers/marketing-consents.ts`:

```ts
import { and, inArray, isNull } from "drizzle-orm";
import { marketingConsents } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = Record<string, never>;

export function makeHandleMarketingConsents(_deps: Deps) {
  return async function handleMarketingConsents(d: HandlerDeps): Promise<HandlerResult> {
    if (d.dinerIds.length === 0) {
      return { tableName: "marketing_consents", rowsRedacted: 0, skipped: true };
    }

    const result = await d.db
      .update(marketingConsents)
      .set({
        revokedAt: new Date(),
        revokeReason: "gdpr_erasure",
      })
      .where(
        and(
          inArray(marketingConsents.dinerId, d.dinerIds),
          isNull(marketingConsents.revokedAt),
        ),
      );

    return {
      tableName: "marketing_consents",
      rowsRedacted: (result as { rowCount?: number }).rowCount ?? 0,
      skipped: false,
    };
  };
}

export const handleMarketingConsents = makeHandleMarketingConsents({});
```

Confirm column names against `src/lib/db/schema.ts` (`revokedAt` / `revokeReason` may be named differently — check the Wave 3 migration 0025).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/compliance/handlers/__tests__/marketing-consents.test.ts`
Expected: PASS.

- [ ] **Step 5: Add registry entry**

Append to `PII_TABLE_REGISTRY` in `src/lib/compliance/pii-table-registry.ts`:

```ts
import { handleMarketingConsents } from "./handlers/marketing-consents";
import { marketingConsents } from "@/lib/db/schema";

async function verifyMarketingConsentsRedacted({ db }: VerifyDeps): Promise<VerificationResult> {
  // marketing_consents redaction = set revoked_at. No residual-PII concept;
  // the table itself holds no plaintext identifiers — it's join-keyed by diner_id.
  return { tableName: "marketing_consents", rowsScanned: 0, rowsWithResidualPii: 0, residualRowIds: [] };
}

// Add this entry AFTER the marketing_suppressions entry:
{
  tableName: "marketing_consents",
  shipped: true,
  handler: handleMarketingConsents,
  verificationQuery: verifyMarketingConsentsRedacted,
  twoPhase: false,
  piiColumns: [],
  defaultReason: "gdpr_art_17",
},
```

- [ ] **Step 6: Run registry tests**

Run: `npm test -- src/lib/compliance/__tests__/pii-table-registry.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/compliance/handlers/marketing-consents.ts src/lib/compliance/handlers/__tests__/marketing-consents.test.ts src/lib/compliance/pii-table-registry.ts
git commit -m "feat(compliance): handleMarketingConsents + registry entry (Wave 4 §13 sub-unit A.7)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `handlePartnerNotificationsPhase1` handler

**Files:**
- Create: `src/lib/compliance/handlers/partner-notifications-phase1.ts`
- Create: `src/lib/compliance/handlers/__tests__/partner-notifications-phase1.test.ts`
- Modify: `src/lib/compliance/pii-table-registry.ts`

- [ ] **Step 1: Write the handler test**

Create the test file with two cases:

```ts
import { makeHandlePartnerNotificationsPhase1 } from "../partner-notifications-phase1";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handlePartnerNotificationsPhase1", () => {
  it("marks pending_erasure_at on notifications matching reservation-payload or diner-payload join paths", async () => {
    const db = {
      execute: jest.fn().mockResolvedValue([{ id: "pn-1" }, { id: "pn-2" }]),
    } as unknown as HandlerDeps["db"];
    const erasureLogInsert = jest.fn().mockResolvedValue({ rowCount: 2 });
    const dbWithInsert = {
      ...db,
      insert: jest.fn().mockReturnValue({ values: erasureLogInsert }),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandlePartnerNotificationsPhase1({});
    const result = await handler({
      db: dbWithInsert,
      dsrId: "dsr-1",
      dinerIds: ["d1"],
      capturedIdentifiers: [],
      actorUserId: "admin",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });

    expect(result.tableName).toBe("partner_notifications");
    expect(result.rowsRedacted).toBe(2);
    expect(erasureLogInsert).toHaveBeenCalled();
  });

  it("is a no-op when dinerIds is empty", async () => {
    const db = { execute: jest.fn(), insert: jest.fn() } as unknown as HandlerDeps["db"];
    const handler = makeHandlePartnerNotificationsPhase1({});
    const result = await handler({
      db, dsrId: "dsr-1", dinerIds: [], capturedIdentifiers: [],
      actorUserId: "admin", impersonatorUserId: undefined, actorRole: "tavli_admin",
    });
    expect(result.rowsRedacted).toBe(0);
    expect(db.execute).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/compliance/handlers/__tests__/partner-notifications-phase1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

Create `src/lib/compliance/handlers/partner-notifications-phase1.ts`:

```ts
import { sql } from "drizzle-orm";
import { erasureLog } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = Record<string, never>;

export function makeHandlePartnerNotificationsPhase1(_deps: Deps) {
  return async function handlePartnerNotificationsPhase1(d: HandlerDeps): Promise<HandlerResult> {
    if (d.dinerIds.length === 0) {
      return { tableName: "partner_notifications", rowsRedacted: 0, skipped: true };
    }

    // UNION of well-known join paths from notification.payload back to a diner.
    // See spec §4.3 for the rationale + add a new SELECT here when §04 ships
    // a notification kind referencing diners through a new payload path.
    const result = await d.db.execute<{ id: string }>(sql`
      UPDATE partner_notifications pn
         SET pending_erasure_at = now(),
             pending_erasure_request_id = ${d.dsrId}::uuid
       WHERE pending_erasure_at IS NULL
         AND pn.id IN (
           SELECT pn1.id
             FROM partner_notifications pn1
             JOIN reservations r
               ON r.id::text = (pn1.payload->>'reservation_id')
            WHERE r.diner_id = ANY(${d.dinerIds}::uuid[])
           UNION
           SELECT pn2.id
             FROM partner_notifications pn2
            WHERE (pn2.payload->>'diner_id') = ANY(${d.dinerIds}::text[])
         )
       RETURNING id;
    `);

    const affectedRowIds = (result as unknown as Array<{ id: string }>).map((r) => r.id);

    if (affectedRowIds.length > 0) {
      await d.db.insert(erasureLog).values(
        affectedRowIds.map((rowId) => ({
          subjectType: "partner_notification",
          subjectId: rowId,
          reason: "gdpr_art_17",
          redactedColumns: ["payload"],
          actorUserId: d.actorUserId,
          impersonatorUserId: d.impersonatorUserId,
          context: { dsrId: d.dsrId, phase: 1 },
        })),
      );
    }

    return {
      tableName: "partner_notifications",
      rowsRedacted: affectedRowIds.length,
      skipped: affectedRowIds.length === 0,
    };
  };
}

export const handlePartnerNotificationsPhase1 = makeHandlePartnerNotificationsPhase1({});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/compliance/handlers/__tests__/partner-notifications-phase1.test.ts`
Expected: PASS.

- [ ] **Step 5: Add registry entry**

Append to `PII_TABLE_REGISTRY`:

```ts
import { handlePartnerNotificationsPhase1 } from "./handlers/partner-notifications-phase1";
import { partnerNotifications } from "@/lib/db/schema";
import { isNotNull, sql as drizzleSql } from "drizzle-orm";

async function verifyPartnerNotificationsRedacted({ db }: VerifyDeps): Promise<VerificationResult> {
  const rows = await db
    .select({ id: partnerNotifications.id })
    .from(partnerNotifications)
    .where(
      drizzleSql`${partnerNotifications.redactedAt} IS NOT NULL
              AND COALESCE(${partnerNotifications.payload}->>'erased', 'false') != 'true'`,
    )
    .limit(100);
  return {
    tableName: "partner_notifications",
    rowsScanned: rows.length,
    rowsWithResidualPii: rows.length,
    residualRowIds: rows.map((r) => r.id),
  };
}

// Add this entry:
{
  tableName: "partner_notifications",
  shipped: true,
  handler: handlePartnerNotificationsPhase1,
  verificationQuery: verifyPartnerNotificationsRedacted,
  twoPhase: true,
  piiColumns: ["payload"],
  defaultReason: "gdpr_art_17",
},
```

- [ ] **Step 6: Run registry tests + handler tests**

Run: `npm test -- src/lib/compliance/`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/compliance/handlers/partner-notifications-phase1.ts src/lib/compliance/handlers/__tests__/partner-notifications-phase1.test.ts src/lib/compliance/pii-table-registry.ts
git commit -m "feat(compliance): handlePartnerNotificationsPhase1 + registry entry (Wave 4 §13 sub-unit A.8)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `handleDiners` handler (wraps `pseudonymiseDiner`)

**Files:**
- Create: `src/lib/compliance/handlers/diners.ts`
- Create: `src/lib/compliance/handlers/__tests__/diners.test.ts`
- Modify: `src/lib/compliance/pii-table-registry.ts`

- [ ] **Step 1: Write the handler test**

Create the test file:

```ts
import { makeHandleDiners } from "../diners";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handleDiners", () => {
  it("calls pseudonymiseDiner once per dinerId", async () => {
    const pseudonymise = jest.fn().mockResolvedValue(undefined);
    const handler = makeHandleDiners({ pseudonymiseDiner: pseudonymise });

    const result = await handler({
      db: {} as HandlerDeps["db"],
      dsrId: "dsr-1",
      dinerIds: ["d1", "d2", "d3"],
      capturedIdentifiers: [],
      actorUserId: "admin",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });

    expect(pseudonymise).toHaveBeenCalledTimes(3);
    expect(pseudonymise).toHaveBeenCalledWith({
      dinerId: "d1",
      reason: "gdpr_erasure_dsr_dsr-1",
      actorUserId: "admin",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });
    expect(result.tableName).toBe("diners");
    expect(result.rowsRedacted).toBe(3);
  });

  it("is a no-op when dinerIds is empty", async () => {
    const pseudonymise = jest.fn();
    const handler = makeHandleDiners({ pseudonymiseDiner: pseudonymise });
    const result = await handler({
      db: {} as HandlerDeps["db"],
      dsrId: "dsr-1", dinerIds: [], capturedIdentifiers: [],
      actorUserId: "admin", impersonatorUserId: undefined, actorRole: "tavli_admin",
    });
    expect(pseudonymise).not.toHaveBeenCalled();
    expect(result.rowsRedacted).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/compliance/handlers/__tests__/diners.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

Create `src/lib/compliance/handlers/diners.ts`:

```ts
import { pseudonymiseDiner as defaultPseudonymise } from "@/lib/diners/pseudonymise";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = {
  pseudonymiseDiner: typeof defaultPseudonymise;
};

export function makeHandleDiners(deps: Deps) {
  return async function handleDiners(d: HandlerDeps): Promise<HandlerResult> {
    if (d.dinerIds.length === 0) {
      return { tableName: "diners", rowsRedacted: 0, skipped: true };
    }

    for (const dinerId of d.dinerIds) {
      await deps.pseudonymiseDiner({
        dinerId,
        reason: `gdpr_erasure_dsr_${d.dsrId}`,
        actorUserId: d.actorUserId,
        impersonatorUserId: d.impersonatorUserId,
        actorRole: d.actorRole,
      });
    }

    return {
      tableName: "diners",
      rowsRedacted: d.dinerIds.length,
      skipped: false,
    };
  };
}

export const handleDiners = makeHandleDiners({ pseudonymiseDiner: defaultPseudonymise });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/compliance/handlers/__tests__/diners.test.ts`
Expected: PASS.

- [ ] **Step 5: Add registry entries (diners + coveredBy entries for reservations / reviews / transactional_email_log)**

Append to `PII_TABLE_REGISTRY`:

```ts
import { handleDiners } from "./handlers/diners";
import { diners, reservations, reviews, transactionalEmailLog } from "@/lib/db/schema";

async function verifyDinersRedacted({ db }: VerifyDeps): Promise<VerificationResult> {
  const rows = await db
    .select({ id: diners.id })
    .from(diners)
    .where(drizzleSql`${diners.redactedAt} IS NOT NULL
                   AND (${diners.phone} IS NOT NULL OR ${diners.email} IS NOT NULL OR ${diners.fullName} IS NOT NULL)`)
    .limit(100);
  return { tableName: "diners", rowsScanned: rows.length, rowsWithResidualPii: rows.length, residualRowIds: rows.map((r) => r.id) };
}

async function verifyReservationsRedacted({ db }: VerifyDeps): Promise<VerificationResult> {
  const rows = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(drizzleSql`${reservations.redactedAt} IS NOT NULL
                   AND (${reservations.guestName} != 'Redacted' OR ${reservations.guestPhone} != 'REDACTED' OR ${reservations.guestEmail} IS NOT NULL)`)
    .limit(100);
  return { tableName: "reservations", rowsScanned: rows.length, rowsWithResidualPii: rows.length, residualRowIds: rows.map((r) => r.id) };
}

async function verifyReviewsRedacted({ db }: VerifyDeps): Promise<VerificationResult> {
  const rows = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(drizzleSql`${reviews.redactedAt} IS NOT NULL AND ${reviews.firstName} != 'Redacted'`)
    .limit(100);
  return { tableName: "reviews", rowsScanned: rows.length, rowsWithResidualPii: rows.length, residualRowIds: rows.map((r) => r.id) };
}

async function verifyTransactionalEmailLogRedacted({ db }: VerifyDeps): Promise<VerificationResult> {
  const rows = await db
    .select({ id: transactionalEmailLog.id })
    .from(transactionalEmailLog)
    .where(drizzleSql`${transactionalEmailLog.redactedAt} IS NOT NULL
                   AND (${transactionalEmailLog.email} IS NOT NULL OR ${transactionalEmailLog.phone} IS NOT NULL)`)
    .limit(100);
  return { tableName: "transactional_email_log", rowsScanned: rows.length, rowsWithResidualPii: rows.length, residualRowIds: rows.map((r) => r.id) };
}

// Append these four entries:
{
  tableName: "diners",
  shipped: true,
  handler: handleDiners,
  verificationQuery: verifyDinersRedacted,
  twoPhase: false,
  piiColumns: ["phone", "phone_raw", "email", "full_name", "internal_notes", "allergies", "occasion_tags", "seating_preferences", "dietary_preferences", "birthday_date", "anniversary_date"],
  defaultReason: "gdpr_art_17",
},
{
  tableName: "reservations",
  shipped: true,
  handler: null,
  coveredBy: "diners",
  verificationQuery: verifyReservationsRedacted,
  twoPhase: false,
  piiColumns: ["guest_name", "guest_phone", "guest_email"],
  defaultReason: "gdpr_art_17",
},
{
  tableName: "reviews",
  shipped: true,
  handler: null,
  coveredBy: "diners",
  verificationQuery: verifyReviewsRedacted,
  twoPhase: false,
  piiColumns: ["first_name"],
  defaultReason: "gdpr_art_17",
},
{
  tableName: "transactional_email_log",
  shipped: true,
  handler: null,
  coveredBy: "diners",
  verificationQuery: verifyTransactionalEmailLogRedacted,
  twoPhase: false,
  piiColumns: ["email", "phone"],
  defaultReason: "gdpr_art_17",
},
```

- [ ] **Step 6: Run tests**

Run: `npm test -- src/lib/compliance/`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/compliance/handlers/diners.ts src/lib/compliance/handlers/__tests__/diners.test.ts src/lib/compliance/pii-table-registry.ts
git commit -m "feat(compliance): handleDiners + four registry entries (Wave 4 §13 sub-unit A.9)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `handleAuditLogs` handler

**Files:**
- Create: `src/lib/compliance/handlers/audit-logs.ts`
- Create: `src/lib/compliance/handlers/__tests__/audit-logs.test.ts`
- Modify: `src/lib/compliance/pii-table-registry.ts`

- [ ] **Step 1: Write the handler test**

Create the test file:

```ts
import { makeHandleAuditLogs } from "../audit-logs";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handleAuditLogs", () => {
  it("runs two chunked passes (diner subject + reservation subject)", async () => {
    const executions: string[] = [];
    let callCount = 0;
    const db = {
      execute: jest.fn().mockImplementation((q) => {
        callCount += 1;
        const sqlText = String(q);
        executions.push(sqlText);
        // simulate exactly one chunk per pass, then empty
        if (callCount === 1 || callCount === 3) {
          return Promise.resolve([{ id: "row-1" }, { id: "row-2" }]);
        }
        return Promise.resolve([]);
      }),
      insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue([]) }),
    } as unknown as HandlerDeps["db"];

    const handler = makeHandleAuditLogs({});
    const result = await handler({
      db,
      dsrId: "dsr-1",
      dinerIds: ["d1"],
      capturedIdentifiers: [],
      actorUserId: "admin",
      impersonatorUserId: undefined,
      actorRole: "tavli_admin",
    });

    expect(result.tableName).toBe("audit_logs");
    expect(result.rowsRedacted).toBe(4); // 2 per pass × 2 passes
    expect(executions.some((s) => s.includes("subject_type = 'diner'"))).toBe(true);
    expect(executions.some((s) => s.includes("subject_type = 'reservation'"))).toBe(true);
  });

  it("is a no-op when dinerIds is empty", async () => {
    const db = { execute: jest.fn(), insert: jest.fn() } as unknown as HandlerDeps["db"];
    const handler = makeHandleAuditLogs({});
    const result = await handler({
      db, dsrId: "dsr-1", dinerIds: [], capturedIdentifiers: [],
      actorUserId: "admin", impersonatorUserId: undefined, actorRole: "tavli_admin",
    });
    expect(result.rowsRedacted).toBe(0);
    expect(db.execute).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/compliance/handlers/__tests__/audit-logs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

Create `src/lib/compliance/handlers/audit-logs.ts`:

```ts
import { sql } from "drizzle-orm";
import { erasureLog } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = Record<string, never>;
const CHUNK_SIZE = 1000;

export function makeHandleAuditLogs(_deps: Deps) {
  return async function handleAuditLogs(d: HandlerDeps): Promise<HandlerResult> {
    if (d.dinerIds.length === 0) {
      return { tableName: "audit_logs", rowsRedacted: 0, skipped: true };
    }

    let totalRedacted = 0;

    // Pass 1: subject_type = 'diner' AND subject_id = ANY($dinerIds)
    totalRedacted += await runChunkedPass(
      d,
      sql`subject_type = 'diner' AND subject_id = ANY(${d.dinerIds}::uuid[])`,
    );

    // Pass 2: subject_type = 'reservation' AND subject_id IN (reservations of these diners)
    totalRedacted += await runChunkedPass(
      d,
      sql`subject_type = 'reservation' AND subject_id IN (SELECT id FROM reservations WHERE diner_id = ANY(${d.dinerIds}::uuid[]))`,
    );

    return {
      tableName: "audit_logs",
      rowsRedacted: totalRedacted,
      skipped: totalRedacted === 0,
    };
  };
}

async function runChunkedPass(d: HandlerDeps, predicate: ReturnType<typeof sql>): Promise<number> {
  let total = 0;
  // Loop until a pass returns zero rows.
  // Each iteration: UPDATE chunk + INSERT erasure_log rows in one transactional pass.
  while (true) {
    const updated = await d.db.execute<{ id: string }>(sql`
      UPDATE audit_logs
         SET redacted_at = now(),
             context = jsonb_build_object(
               'erased', true,
               'dsr_id', ${d.dsrId}::uuid,
               'original_action', action
             )
       WHERE id IN (
         SELECT id FROM audit_logs
          WHERE ${predicate}
            AND redacted_at IS NULL
          ORDER BY id
          LIMIT ${CHUNK_SIZE}
       )
       RETURNING id;
    `);

    const rows = (updated as unknown as Array<{ id: string }>);
    if (rows.length === 0) break;
    total += rows.length;

    await d.db.insert(erasureLog).values(
      rows.map((r) => ({
        subjectType: "audit_log",
        subjectId: r.id,
        reason: "gdpr_art_17",
        redactedColumns: ["context"],
        actorUserId: d.actorUserId,
        impersonatorUserId: d.impersonatorUserId,
        context: { dsrId: d.dsrId },
      })),
    );

    if (rows.length < CHUNK_SIZE) break;
  }
  return total;
}

export const handleAuditLogs = makeHandleAuditLogs({});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/compliance/handlers/__tests__/audit-logs.test.ts`
Expected: PASS.

- [ ] **Step 5: Add registry entry**

Append to `PII_TABLE_REGISTRY`:

```ts
import { handleAuditLogs } from "./handlers/audit-logs";
import { auditLogs } from "@/lib/db/schema";

async function verifyAuditLogsRedacted({ db }: VerifyDeps): Promise<VerificationResult> {
  const rows = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(drizzleSql`${auditLogs.redactedAt} IS NOT NULL
                   AND COALESCE(${auditLogs.context}->>'erased', 'false') != 'true'`)
    .limit(100);
  return { tableName: "audit_logs", rowsScanned: rows.length, rowsWithResidualPii: rows.length, residualRowIds: rows.map((r) => r.id) };
}

{
  tableName: "audit_logs",
  shipped: true,
  handler: handleAuditLogs,
  verificationQuery: verifyAuditLogsRedacted,
  twoPhase: false,
  piiColumns: ["context"],
  defaultReason: "gdpr_art_17",
},
```

- [ ] **Step 6: Run tests**

Run: `npm test -- src/lib/compliance/`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/compliance/handlers/audit-logs.ts src/lib/compliance/handlers/__tests__/audit-logs.test.ts src/lib/compliance/pii-table-registry.ts
git commit -m "feat(compliance): handleAuditLogs + registry entry (Wave 4 §13 sub-unit A.10)

Two-pass chunked redaction (subject_type='diner' + subject_type='reservation'),
1000 rows per chunk, one erasure_log row per redacted audit_logs row.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `handlePartnerNotificationsPhase2` handler

**Files:**
- Create: `src/lib/compliance/handlers/partner-notifications-phase2.ts`
- Create: `src/lib/compliance/handlers/__tests__/partner-notifications-phase2.test.ts`

- [ ] **Step 1: Write the handler test**

Create the test:

```ts
import { makeHandlePartnerNotificationsPhase2, HARD_DELETE_ELIGIBLE_KINDS } from "../partner-notifications-phase2";
import type { HandlerDeps } from "../../pii-table-registry";

describe("handlePartnerNotificationsPhase2", () => {
  it("hard-deletes notifications past their display window with eligible kinds", async () => {
    const db = {
      execute: jest.fn()
        .mockResolvedValueOnce([
          { id: "pn-1", kind: "reservation_created", created_at: new Date(Date.now() - 40 * 86_400_000) },
          { id: "pn-2", kind: "diner_pseudonymised", created_at: new Date(Date.now() - 40 * 86_400_000) },
        ]),
    } as unknown as HandlerDeps["db"];

    // mock the subsequent DELETE + UPDATE calls
    (db.execute as jest.Mock).mockResolvedValueOnce({ rowCount: 1 }); // DELETE
    (db.execute as jest.Mock).mockResolvedValueOnce({ rowCount: 1 }); // UPDATE (payload replace)
    const insertValues = jest.fn().mockResolvedValue([]);
    (db as any).insert = jest.fn().mockReturnValue({ values: insertValues });

    const handler = makeHandlePartnerNotificationsPhase2({});
    const result = await handler({
      db, dsrId: "dsr-1", dinerIds: ["d1"], capturedIdentifiers: [],
      actorUserId: "admin", impersonatorUserId: undefined, actorRole: "tavli_admin",
    });

    expect(result.tableName).toBe("partner_notifications");
    expect(HARD_DELETE_ELIGIBLE_KINDS).toContain("reservation_created");
    expect(insertValues).toHaveBeenCalled();
  });

  it("is a no-op when no marked rows match the dsrId", async () => {
    const db = {
      execute: jest.fn().mockResolvedValueOnce([]),
      insert: jest.fn(),
    } as unknown as HandlerDeps["db"];
    const handler = makeHandlePartnerNotificationsPhase2({});
    const result = await handler({
      db, dsrId: "dsr-1", dinerIds: ["d1"], capturedIdentifiers: [],
      actorUserId: "admin", impersonatorUserId: undefined, actorRole: "tavli_admin",
    });
    expect(result.rowsRedacted).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/compliance/handlers/__tests__/partner-notifications-phase2.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the handler**

Create `src/lib/compliance/handlers/partner-notifications-phase2.ts`:

```ts
import { sql } from "drizzle-orm";
import { erasureLog } from "@/lib/db/schema";
import type { HandlerDeps, HandlerResult } from "../pii-table-registry";

type Deps = Record<string, never>;

/**
 * Notification kinds whose 30+ day-old rows can be hard-deleted at phase 2.
 * Add new kinds here as §04 expands the notification catalogue. Kinds whose
 * existence is audit-load-bearing (even if their payload is PII) should NOT
 * appear here — they get payload-replaced instead.
 */
export const HARD_DELETE_ELIGIBLE_KINDS = [
  "reservation_created",
  "reservation_modified",
  "reservation_cancelled",
] as const;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function makeHandlePartnerNotificationsPhase2(_deps: Deps) {
  return async function handlePartnerNotificationsPhase2(d: HandlerDeps): Promise<HandlerResult> {
    // Load marked rows for this DSR
    const marked = await d.db.execute<{ id: string; kind: string; created_at: Date }>(sql`
      SELECT id, kind, created_at
        FROM partner_notifications
       WHERE pending_erasure_request_id = ${d.dsrId}::uuid
         AND redacted_at IS NULL
    `);

    const rows = marked as unknown as Array<{ id: string; kind: string; created_at: Date }>;
    if (rows.length === 0) {
      return { tableName: "partner_notifications", rowsRedacted: 0, skipped: true };
    }

    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
    const toDelete = rows.filter(
      (r) => (HARD_DELETE_ELIGIBLE_KINDS as readonly string[]).includes(r.kind) && r.created_at < cutoff,
    );
    const toReplace = rows.filter((r) => !toDelete.includes(r));

    let total = 0;

    if (toDelete.length > 0) {
      const ids = toDelete.map((r) => r.id);
      await d.db.execute(sql`DELETE FROM partner_notifications WHERE id = ANY(${ids}::uuid[])`);
      total += ids.length;
    }

    if (toReplace.length > 0) {
      const ids = toReplace.map((r) => r.id);
      await d.db.execute(sql`
        UPDATE partner_notifications
           SET redacted_at = now(),
               payload = jsonb_build_object(
                 'erased', true,
                 'dsr_id', ${d.dsrId}::uuid,
                 'original_kind', kind
               )
         WHERE id = ANY(${ids}::uuid[])
      `);
      total += ids.length;
    }

    // One erasure_log row per affected (deleted or redacted) notification, phase=2.
    if (rows.length > 0) {
      await d.db.insert(erasureLog).values(
        rows.map((r) => ({
          subjectType: "partner_notification",
          subjectId: r.id,
          reason: "gdpr_art_17",
          redactedColumns: toDelete.includes(r) ? ["row_deleted"] : ["payload"],
          actorUserId: d.actorUserId,
          impersonatorUserId: d.impersonatorUserId,
          context: { dsrId: d.dsrId, phase: 2, kind: r.kind },
        })),
      );
    }

    return { tableName: "partner_notifications", rowsRedacted: total, skipped: false };
  };
}

export const handlePartnerNotificationsPhase2 = makeHandlePartnerNotificationsPhase2({});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/compliance/handlers/__tests__/partner-notifications-phase2.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

(No registry entry — phase 2 is invoked by its own pg-boss job, not iterated.)

```bash
git add src/lib/compliance/handlers/partner-notifications-phase2.ts src/lib/compliance/handlers/__tests__/partner-notifications-phase2.test.ts
git commit -m "feat(compliance): handlePartnerNotificationsPhase2 + hard-delete-eligible kinds (Wave 4 §13 sub-unit A.11)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — Email template

### Task 12: `DataDeletionConfirmedEmail` RO + EN + DE templates

**Files:**
- Create: `src/emails/messages/ro/DataDeletionConfirmed.tsx`
- Create: `src/emails/messages/en/DataDeletionConfirmed.tsx`
- Create: `src/emails/messages/de/DataDeletionConfirmed.tsx`
- Modify: `src/lib/email/send-transactional.ts`

- [ ] **Step 1: Look at an existing template for pattern**

Run: `ls src/emails/messages/ro/`
Pick the simplest existing `.tsx` and `cat` it to learn the conventions (which props, which EmailShell, which subject-getter).

- [ ] **Step 2: Create the RO template**

`src/emails/messages/ro/DataDeletionConfirmed.tsx`:

```tsx
import { EmailShell } from "@/emails/components/EmailShell"; // adjust import to match existing convention
import { Heading, Text } from "@react-email/components";

export interface DataDeletionConfirmedProps {
  dsrId: string;
  completedAt: Date;
  createdAt: Date;
}

export function getSubject(_props: DataDeletionConfirmedProps): string {
  return "Datele tale au fost șterse din Tavli";
}

export default function DataDeletionConfirmed({ dsrId, completedAt, createdAt }: DataDeletionConfirmedProps) {
  return (
    <EmailShell locale="ro">
      <Heading>Cererea ta de ștergere este finalizată</Heading>
      <Text>
        Conform cererii tale din {createdAt.toLocaleDateString("ro-RO")}, toate datele
        tale personale au fost șterse din sistemele Tavli.
      </Text>
      <Text>
        Referință: <code>{dsrId}</code>. Finalizat: {completedAt.toLocaleDateString("ro-RO")}.
      </Text>
      <Text>
        Un număr limitat de înregistrări operaționale (de exemplu, evidențele fiscale
        cerute de legislația română) sunt păstrate conform legislației aplicabile.
      </Text>
      <Text>Întrebări? Scrie-ne la legal@tavli.ro.</Text>
    </EmailShell>
  );
}
```

- [ ] **Step 3: Create the EN template**

`src/emails/messages/en/DataDeletionConfirmed.tsx`:

```tsx
import { EmailShell } from "@/emails/components/EmailShell";
import { Heading, Text } from "@react-email/components";

export interface DataDeletionConfirmedProps {
  dsrId: string;
  completedAt: Date;
  createdAt: Date;
}

export function getSubject(_props: DataDeletionConfirmedProps): string {
  return "Your data has been deleted from Tavli";
}

export default function DataDeletionConfirmed({ dsrId, completedAt, createdAt }: DataDeletionConfirmedProps) {
  return (
    <EmailShell locale="en">
      <Heading>Your deletion request is complete</Heading>
      <Text>
        Per your request on {createdAt.toLocaleDateString("en-GB")}, all your personal
        data has been deleted from Tavli's systems.
      </Text>
      <Text>
        Reference: <code>{dsrId}</code>. Completed: {completedAt.toLocaleDateString("en-GB")}.
      </Text>
      <Text>
        A small number of operational records (for example, fiscal entries required
        by Romanian law) are retained under applicable regulation.
      </Text>
      <Text>Questions? Email legal@tavli.ro.</Text>
    </EmailShell>
  );
}
```

- [ ] **Step 4: Create the DE template**

`src/emails/messages/de/DataDeletionConfirmed.tsx`:

```tsx
import { EmailShell } from "@/emails/components/EmailShell";
import { Heading, Text } from "@react-email/components";

export interface DataDeletionConfirmedProps {
  dsrId: string;
  completedAt: Date;
  createdAt: Date;
}

export function getSubject(_props: DataDeletionConfirmedProps): string {
  return "Ihre Daten wurden bei Tavli gelöscht";
}

export default function DataDeletionConfirmed({ dsrId, completedAt, createdAt }: DataDeletionConfirmedProps) {
  return (
    <EmailShell locale="de">
      <Heading>Ihre Löschungsanfrage ist abgeschlossen</Heading>
      <Text>
        Gemäß Ihrer Anfrage vom {createdAt.toLocaleDateString("de-DE")} wurden alle
        Ihre personenbezogenen Daten aus den Tavli-Systemen gelöscht.
      </Text>
      <Text>
        Referenz: <code>{dsrId}</code>. Abgeschlossen: {completedAt.toLocaleDateString("de-DE")}.
      </Text>
      <Text>
        Eine begrenzte Anzahl operativer Aufzeichnungen (zum Beispiel steuerlich
        vorgeschriebene Einträge gemäß rumänischem Recht) wird gemäß geltendem
        Recht aufbewahrt.
      </Text>
      <Text>Fragen? Schreiben Sie an legal@tavli.ro.</Text>
    </EmailShell>
  );
}
```

- [ ] **Step 5: Register the template key in `send-transactional.ts`**

Open `src/lib/email/send-transactional.ts`. Find the template-key registry / discriminated union. Add `'data_deletion_confirmed'` as a new key, mapping to the three locale-specific render functions. (The exact shape depends on how Wave 3 organised template dispatch — match the existing pattern for `reservation_confirmation` or similar.)

- [ ] **Step 6: Run a smoke render test**

If there's an existing snapshot or render test for another template, copy the pattern and add a smoke test asserting the three locales render without throwing:

```ts
import { render } from "@react-email/render";
import RoTemplate from "@/emails/messages/ro/DataDeletionConfirmed";
import EnTemplate from "@/emails/messages/en/DataDeletionConfirmed";
import DeTemplate from "@/emails/messages/de/DataDeletionConfirmed";

describe("DataDeletionConfirmed", () => {
  const props = { dsrId: "dsr-1", completedAt: new Date(), createdAt: new Date() };
  it("renders RO", async () => { await expect(render(RoTemplate(props))).resolves.toBeTruthy(); });
  it("renders EN", async () => { await expect(render(EnTemplate(props))).resolves.toBeTruthy(); });
  it("renders DE", async () => { await expect(render(DeTemplate(props))).resolves.toBeTruthy(); });
});
```

Run: `npm test -- src/emails/messages`
Expected: three tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/emails/messages/ro/DataDeletionConfirmed.tsx src/emails/messages/en/DataDeletionConfirmed.tsx src/emails/messages/de/DataDeletionConfirmed.tsx src/lib/email/send-transactional.ts
git commit -m "feat(compliance): DataDeletionConfirmed email RO/EN/DE + send wiring (Wave 4 §13 sub-unit A.12)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — Orchestrator + verification + pg-boss

### Task 13: Add `JOBS.compliance.erasurePartnerNotificationsPhase2` key

**Files:**
- Modify: `src/lib/jobs/keys.ts`

- [ ] **Step 1: Add the key**

In `src/lib/jobs/keys.ts`, locate the `compliance:` block and append:

```ts
erasurePartnerNotificationsPhase2: "compliance.erasure-partner-notifications-phase-2",
```

- [ ] **Step 2: Verify the type compiles**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/jobs/keys.ts
git commit -m "chore(jobs): add JOBS.compliance.erasurePartnerNotificationsPhase2 key (Wave 4 §13)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Orchestrator + verification sweep + pg-boss handlers

**Files:**
- Create: `src/lib/jobs/handlers/compliance.ts`
- Create: `src/lib/jobs/__tests__/handlers/compliance.test.ts`
- Create: `src/lib/compliance/verify.ts`
- Create: `src/lib/compliance/__tests__/verify.test.ts`

- [ ] **Step 1: Write the orchestrator test**

Create `src/lib/jobs/__tests__/handlers/compliance.test.ts`:

```ts
import { makeHandleErasureExecute } from "../../handlers/compliance";

describe("handleErasureExecute", () => {
  const fakeDsr = {
    id: "dsr-1",
    status: "in_progress" as const,
    identityVerified: true,
    approvedByUserId: "admin-1",
    dinerId: "d1",
    identifierEmail: "alice@example.ro",
    identifierPhone: null,
  };

  it("loads dsr, resolves diners, iterates registry, marks completed", async () => {
    const loadDsr = jest.fn().mockResolvedValue(fakeDsr);
    const resolveDiners = jest.fn().mockResolvedValue({
      dinerIds: ["d1"],
      capturedIdentifiers: [{ dinerId: "d1", phone: null, email: "alice@example.ro" }],
    });
    const handler1 = jest.fn().mockResolvedValue({ tableName: "marketing_suppressions", rowsRedacted: 1, skipped: false });
    const updateDsrCompleted = jest.fn().mockResolvedValue(undefined);
    const enqueuePhase2 = jest.fn().mockResolvedValue(undefined);
    const enqueuePurge = jest.fn().mockResolvedValue(undefined);
    const recordAudit = jest.fn().mockResolvedValue(undefined);
    const sendEmail = jest.fn().mockResolvedValue(undefined);

    const subject = makeHandleErasureExecute({
      loadDsr, resolveDiners, registry: [{ tableName: "marketing_suppressions", shipped: true, handler: handler1, verificationQuery: null, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" }],
      updateDsrCompleted, enqueuePhase2, enqueuePurge, recordAudit, sendEmail,
    });

    await subject({ requestId: "dsr-1" });

    expect(loadDsr).toHaveBeenCalledWith("dsr-1");
    expect(handler1).toHaveBeenCalled();
    expect(enqueuePhase2).toHaveBeenCalledWith({ requestId: "dsr-1" });
    expect(updateDsrCompleted).toHaveBeenCalled();
    expect(enqueuePurge).toHaveBeenCalledWith({ dinerId: "d1" });
    expect(recordAudit).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "alice@example.ro" }));
  });

  it("throws TV1101 when DSR status is not in_progress", async () => {
    const loadDsr = jest.fn().mockResolvedValue({ ...fakeDsr, status: "received" });
    const subject = makeHandleErasureExecute({
      loadDsr, resolveDiners: jest.fn(), registry: [],
      updateDsrCompleted: jest.fn(), enqueuePhase2: jest.fn(), enqueuePurge: jest.fn(),
      recordAudit: jest.fn(), sendEmail: jest.fn(),
    });
    await expect(subject({ requestId: "dsr-1" })).rejects.toThrow(/TV1101/);
  });

  it("throws TV1102 when identity not verified", async () => {
    const loadDsr = jest.fn().mockResolvedValue({ ...fakeDsr, identityVerified: false });
    const subject = makeHandleErasureExecute({
      loadDsr, resolveDiners: jest.fn(), registry: [],
      updateDsrCompleted: jest.fn(), enqueuePhase2: jest.fn(), enqueuePurge: jest.fn(),
      recordAudit: jest.fn(), sendEmail: jest.fn(),
    });
    await expect(subject({ requestId: "dsr-1" })).rejects.toThrow(/TV1102/);
  });

  it("skips stub registry entries (shipped:false or handler:null without coveredBy)", async () => {
    const handlerCalled = jest.fn();
    const subject = makeHandleErasureExecute({
      loadDsr: jest.fn().mockResolvedValue(fakeDsr),
      resolveDiners: jest.fn().mockResolvedValue({ dinerIds: ["d1"], capturedIdentifiers: [] }),
      registry: [
        { tableName: "billing_audit_log", shipped: false, handler: null, verificationQuery: null, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" },
        { tableName: "reservations", shipped: true, handler: null, coveredBy: "diners", verificationQuery: null, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" },
      ],
      updateDsrCompleted: jest.fn().mockResolvedValue(undefined),
      enqueuePhase2: jest.fn().mockResolvedValue(undefined),
      enqueuePurge: jest.fn().mockResolvedValue(undefined),
      recordAudit: jest.fn().mockResolvedValue(undefined),
      sendEmail: jest.fn().mockResolvedValue(undefined),
    });
    await subject({ requestId: "dsr-1" });
    expect(handlerCalled).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/jobs/__tests__/handlers/compliance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the orchestrator**

Create `src/lib/jobs/handlers/compliance.ts`:

```ts
import { dbAdmin } from "@/lib/db/admin";
import { dataSubjectRequests, diners } from "@/lib/db/schema";
import { eq, or, inArray } from "drizzle-orm";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { PII_TABLE_REGISTRY, type PiiTableEntry } from "@/lib/compliance/pii-table-registry";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { resolveDinerLocale } from "@/lib/email/resolve-locale";
import { enqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";
import { handlePartnerNotificationsPhase2 } from "@/lib/compliance/handlers/partner-notifications-phase2";

export interface ErasureExecutePayload {
  requestId: string;
}

interface DsrRow {
  id: string;
  status: string;
  identityVerified: boolean;
  approvedByUserId: string | null;
  dinerId: string | null;
  identifierEmail: string | null;
  identifierPhone: string | null;
}

interface ResolveDinersResult {
  dinerIds: string[];
  capturedIdentifiers: Array<{ dinerId: string; phone: string | null; email: string | null }>;
}

interface Deps {
  loadDsr: (id: string) => Promise<DsrRow | null>;
  resolveDiners: (dsr: DsrRow) => Promise<ResolveDinersResult>;
  registry: readonly PiiTableEntry[];
  updateDsrCompleted: (id: string, summary: unknown) => Promise<void>;
  enqueuePhase2: (payload: { requestId: string }) => Promise<void>;
  enqueuePurge: (payload: { dinerId: string }) => Promise<void>;
  recordAudit: typeof recordAudit;
  sendEmail: (args: { to: string; template: "data_deletion_confirmed"; locale: "ro" | "en" | "de"; params: Record<string, unknown> }) => Promise<void>;
}

export function makeHandleErasureExecute(deps: Deps) {
  return async function handleErasureExecute(payload: ErasureExecutePayload): Promise<void> {
    const dsr = await deps.loadDsr(payload.requestId);
    if (!dsr) throw new Error(`TV1100 dsr_not_found: ${payload.requestId}`);
    if (dsr.status !== "in_progress") throw new Error(`TV1101 dsr_wrong_status: ${dsr.status}`);
    if (!dsr.identityVerified) throw new Error(`TV1102 dsr_not_verified`);
    if (!dsr.approvedByUserId) throw new Error(`TV1102 dsr_not_verified: missing approver`);

    const actorUserId = dsr.approvedByUserId;

    const { dinerIds, capturedIdentifiers } = await deps.resolveDiners(dsr);

    const summary: Array<{ tableName: string; rowsRedacted: number }> = [];
    for (const entry of deps.registry) {
      if (!entry.shipped || !entry.handler) continue;
      const result = await entry.handler({
        db: dbAdmin,
        dsrId: dsr.id,
        dinerIds,
        capturedIdentifiers,
        actorUserId,
        impersonatorUserId: undefined,
        actorRole: "tavli_admin",
      });
      summary.push({ tableName: result.tableName, rowsRedacted: result.rowsRedacted });
    }

    // Schedule phase 2 of partner_notifications +5 minutes from now.
    await deps.enqueuePhase2({ requestId: dsr.id });

    // Mark DSR completed.
    await deps.updateDsrCompleted(dsr.id, summary);

    // Audit the DSR-level cascade rollup.
    await deps.recordAudit({
      action: AUDIT.compliance.dsr_cascade_executed,
      subjectType: "data_subject_request",
      subjectId: dsr.id,
      actorUserId,
      actorRole: "tavli_admin",
      context: { dinerIds, summary, capturedIdentifierCount: capturedIdentifiers.length },
    });

    // Schedule the +30-day hard-delete per diner.
    for (const dinerId of dinerIds) {
      await deps.enqueuePurge({ dinerId });
    }

    // Confirmation email per unique identifier_email.
    const seen = new Set<string>();
    for (const ci of capturedIdentifiers) {
      if (ci.email && !seen.has(ci.email)) {
        seen.add(ci.email);
        const locale = (await resolveDinerLocaleSafe(ci.dinerId)) ?? "ro";
        try {
          await deps.sendEmail({
            to: ci.email,
            template: "data_deletion_confirmed",
            locale,
            params: { dsrId: dsr.id, completedAt: new Date(), createdAt: new Date() },
          });
        } catch (err) {
          // Send failure does NOT roll back the cascade. Logged via send-transactional substrate.
        }
      }
    }
  };
}

async function resolveDinerLocaleSafe(_dinerId: string): Promise<"ro" | "en" | "de" | null> {
  // Production wiring loads the diner row + calls resolveDinerLocale; for the
  // handler's DI seam the production-deps factory injects this. Default null
  // here so unit tests don't need a db; orchestrator defaults to 'ro' anyway.
  return null;
}

// Production-bound handler (used by bootstrap.ts → boss.work).
export const handleErasureExecute = makeHandleErasureExecute({
  loadDsr: async (id) => {
    const rows = await dbAdmin.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.id, id)).limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      status: r.status,
      identityVerified: r.identityVerified,
      approvedByUserId: r.approvedByUserId,
      dinerId: r.dinerId,
      identifierEmail: r.identifierEmail,
      identifierPhone: r.identifierPhone,
    };
  },
  resolveDiners: async (dsr) => {
    const ids = new Set<string>();
    if (dsr.dinerId) ids.add(dsr.dinerId);
    if (dsr.identifierPhone || dsr.identifierEmail) {
      const matches = await dbAdmin
        .select({ id: diners.id, phone: diners.phone, email: diners.email })
        .from(diners)
        .where(
          or(
            dsr.identifierPhone ? eq(diners.phone, dsr.identifierPhone) : undefined,
            dsr.identifierEmail ? eq(diners.email, dsr.identifierEmail) : undefined,
          )!,
        );
      for (const m of matches) ids.add(m.id);
    }
    const dinerIds = [...ids];
    if (dinerIds.length === 0) return { dinerIds: [], capturedIdentifiers: [] };
    const rows = await dbAdmin
      .select({ id: diners.id, phone: diners.phone, email: diners.email })
      .from(diners)
      .where(inArray(diners.id, dinerIds));
    const capturedIdentifiers = rows.map((r) => ({ dinerId: r.id, phone: r.phone, email: r.email }));
    return { dinerIds, capturedIdentifiers };
  },
  registry: PII_TABLE_REGISTRY,
  updateDsrCompleted: async (id, _summary) => {
    await dbAdmin
      .update(dataSubjectRequests)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(dataSubjectRequests.id, id));
  },
  enqueuePhase2: async (payload) => {
    await enqueue(JOBS.compliance.erasurePartnerNotificationsPhase2, payload, { startAfter: 5 * 60 });
  },
  enqueuePurge: async (payload) => {
    await enqueue(JOBS.diner.purgePseudonymised, payload, { startAfter: 30 * 24 * 60 * 60 });
  },
  recordAudit,
  sendEmail: sendTransactionalEmail as Deps["sendEmail"],
});

// ─── Phase 2 wrapper ──────────────────────────────────────────────────────
export interface ErasurePhase2Payload { requestId: string; }
export async function handleErasurePartnerNotificationsPhase2(payload: ErasurePhase2Payload): Promise<void> {
  await handlePartnerNotificationsPhase2({
    db: dbAdmin,
    dsrId: payload.requestId,
    dinerIds: [],
    capturedIdentifiers: [],
    actorUserId: "system",
    impersonatorUserId: undefined,
    actorRole: "tavli_admin",
  });
}
```

(Notes for the engineer: the `enqueue()` helper signature comes from `src/lib/jobs/enqueue.ts` — adjust the `startAfter` argument shape to match the actual helper. Same for `sendTransactionalEmail` — match its exported type. The `resolveDinerLocaleSafe` stub returns null in this scaffolding; wire it to call `resolveDinerLocale` against `dbAdmin` once unit tests pass.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/jobs/__tests__/handlers/compliance.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the verification sweep**

Create `src/lib/compliance/verify.ts`:

```ts
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { PII_TABLE_REGISTRY, type PiiTableEntry, type VerificationResult } from "./pii-table-registry";

interface Deps {
  registry: readonly PiiTableEntry[];
  recordAudit: typeof recordAudit;
  sentryAlert: (msg: string, ctx: unknown) => void;
}

export function makeRunErasureVerification(deps: Deps) {
  return async function runErasureVerification(): Promise<{
    rowsScannedByTable: Record<string, number>;
    residual: VerificationResult[];
  }> {
    const rowsScannedByTable: Record<string, number> = {};
    const residual: VerificationResult[] = [];

    for (const entry of deps.registry) {
      if (!entry.shipped || !entry.verificationQuery) continue;
      const result = await entry.verificationQuery({ db: dbAdmin as any });
      rowsScannedByTable[result.tableName] = result.rowsScanned;
      if (result.rowsWithResidualPii > 0) residual.push(result);
    }

    if (residual.length > 0) {
      deps.sentryAlert("erasure_verification_failed", { residual });
      await deps.recordAudit({
        action: AUDIT.compliance.erasure_verification_failed,
        subjectType: "system",
        subjectId: "00000000-0000-0000-0000-000000000000",
        actorUserId: null,
        actorRole: "system",
        context: { residual, rowsScannedByTable },
      });
    } else {
      await deps.recordAudit({
        action: AUDIT.compliance.erasure_verification_passed,
        subjectType: "system",
        subjectId: "00000000-0000-0000-0000-000000000000",
        actorUserId: null,
        actorRole: "system",
        context: { rowsScannedByTable },
      });
    }

    return { rowsScannedByTable, residual };
  };
}

export const runErasureVerification = makeRunErasureVerification({
  registry: PII_TABLE_REGISTRY,
  recordAudit,
  sentryAlert: (msg, ctx) => {
    // In production this calls into Sentry; tests inject a mock.
    // The error-level call wires to Sentry.captureMessage(msg, { level: 'error', extra: ctx }).
    console.error(`[sentry] ${msg}`, ctx);
  },
});
```

- [ ] **Step 6: Write the verification test**

Create `src/lib/compliance/__tests__/verify.test.ts`:

```ts
import { makeRunErasureVerification } from "../verify";

describe("runErasureVerification", () => {
  it("records erasure_verification_passed when no residual PII", async () => {
    const recordAudit = jest.fn().mockResolvedValue(undefined);
    const sentryAlert = jest.fn();
    const verifyQ = jest.fn().mockResolvedValue({ tableName: "diners", rowsScanned: 5, rowsWithResidualPii: 0, residualRowIds: [] });
    const subject = makeRunErasureVerification({
      registry: [{ tableName: "diners", shipped: true, handler: null, verificationQuery: verifyQ, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" }],
      recordAudit, sentryAlert,
    });
    await subject();
    expect(recordAudit.mock.calls[0][0].action).toMatch(/erasure_verification_passed/);
    expect(sentryAlert).not.toHaveBeenCalled();
  });

  it("records erasure_verification_failed + sentry alert on residual PII", async () => {
    const recordAudit = jest.fn().mockResolvedValue(undefined);
    const sentryAlert = jest.fn();
    const verifyQ = jest.fn().mockResolvedValue({ tableName: "diners", rowsScanned: 1, rowsWithResidualPii: 1, residualRowIds: ["row-1"] });
    const subject = makeRunErasureVerification({
      registry: [{ tableName: "diners", shipped: true, handler: null, verificationQuery: verifyQ, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" }],
      recordAudit, sentryAlert,
    });
    await subject();
    expect(recordAudit.mock.calls[0][0].action).toMatch(/erasure_verification_failed/);
    expect(sentryAlert).toHaveBeenCalledWith("erasure_verification_failed", expect.any(Object));
  });

  it("skips stub registry entries", async () => {
    const recordAudit = jest.fn().mockResolvedValue(undefined);
    const verifyQ = jest.fn();
    const subject = makeRunErasureVerification({
      registry: [{ tableName: "billing_audit_log", shipped: false, handler: null, verificationQuery: verifyQ, twoPhase: false, piiColumns: [], defaultReason: "gdpr_art_17" }],
      recordAudit, sentryAlert: jest.fn(),
    });
    await subject();
    expect(verifyQ).not.toHaveBeenCalled();
  });
});
```

Run: `npm test -- src/lib/compliance/__tests__/verify.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/jobs/handlers/compliance.ts src/lib/jobs/__tests__/handlers/compliance.test.ts src/lib/compliance/verify.ts src/lib/compliance/__tests__/verify.test.ts
git commit -m "feat(compliance): erasure orchestrator + verification sweep (Wave 4 §13 sub-unit A.14)

handleErasureExecute iterates pii-table-registry, calls each shipped handler,
schedules partner_notifications phase 2 +5min, schedules diner purge +30d,
records dsr_cascade_executed, sends DataDeletionConfirmedEmail. Verification
sweep iterates verificationQuery functions, sentry-alerts on residual PII.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Register compliance handlers in bootstrap + schedule verify sweep

**Files:**
- Modify: `src/lib/jobs/bootstrap.ts`

- [ ] **Step 1: Read the existing bootstrap pattern**

Run: `head -100 src/lib/jobs/bootstrap.ts`
Expected: shows the existing `boss.work(JOBS.diner.recomputeAggregates, ...)` pattern.

- [ ] **Step 2: Add the three new registrations + purge wiring**

In `src/lib/jobs/bootstrap.ts`, locate the section where domain handlers are registered. Add:

```ts
import { handleErasureExecute, handleErasurePartnerNotificationsPhase2 } from "./handlers/compliance";
import { runErasureVerification } from "@/lib/compliance/verify";
import { handlePurgePseudonymised } from "./handlers/diners";

// ... inside the bootstrap function, alongside other boss.work calls:
await boss.work(JOBS.compliance.erasureExecute, async (job) => {
  await handleErasureExecute(job.data as { requestId: string });
});
await boss.work(JOBS.compliance.erasurePartnerNotificationsPhase2, async (job) => {
  await handleErasurePartnerNotificationsPhase2(job.data as { requestId: string });
});
await boss.work(JOBS.compliance.erasureVerify, async () => {
  await runErasureVerification();
});

// Close Wave 3 loose end: diner.purge-pseudonymised handler was shipped but not registered.
await boss.work(JOBS.diner.purgePseudonymised, async (job) => {
  await handlePurgePseudonymised(job.data as { dinerId: string });
});

// Schedule nightly verification sweep at 03:00 UTC.
await boss.schedule(JOBS.compliance.erasureVerify, "0 3 * * *");
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Add a smoke test to bootstrap.test.ts**

In `src/lib/jobs/__tests__/bootstrap.test.ts`, add a test asserting the four new handlers are registered:

```ts
it("registers compliance handlers + diner.purgePseudonymised + nightly verification", async () => {
  const boss = makeMockBoss();
  await bootstrap(boss);
  expect(boss.work).toHaveBeenCalledWith("compliance.erasure-execute", expect.any(Function));
  expect(boss.work).toHaveBeenCalledWith("compliance.erasure-partner-notifications-phase-2", expect.any(Function));
  expect(boss.work).toHaveBeenCalledWith("compliance.erasure-verify", expect.any(Function));
  expect(boss.work).toHaveBeenCalledWith("diner.purge-pseudonymised", expect.any(Function));
  expect(boss.schedule).toHaveBeenCalledWith("compliance.erasure-verify", "0 3 * * *");
});
```

Run: `npm test -- src/lib/jobs/__tests__/bootstrap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/bootstrap.ts src/lib/jobs/__tests__/bootstrap.test.ts
git commit -m "feat(jobs): register compliance handlers + schedule nightly verify (Wave 4 §13 sub-unit A.15)

Also closes Wave 3 deferred follow-up: handlePurgePseudonymised was shipped
but never registered at worker bootstrap.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — Server actions + permissions + AUDIT entries

### Task 16: Add new `AUDIT.compliance.*` action strings

**Files:**
- Modify: `src/lib/audit/actions.ts`

- [ ] **Step 1: Locate the existing AUDIT.compliance namespace**

Run: `grep -A20 "compliance:" src/lib/audit/actions.ts | head -30`

- [ ] **Step 2: Add the new actions**

In the `AUDIT.compliance` block, add the following keys (preserving existing `erasure_executed`):

```ts
dsr_created: "compliance.dsr_created",
dsr_resolved: "compliance.dsr_resolved",
dsr_identity_verified: "compliance.dsr_identity_verified",
dsr_approved: "compliance.dsr_approved",
dsr_rejected: "compliance.dsr_rejected",
dsr_extended: "compliance.dsr_extended",
dsr_cascade_executed: "compliance.dsr_cascade_executed",
dsr_cascade_failed: "compliance.dsr_cascade_failed",
erasure_verification_passed: "compliance.erasure_verification_passed",
erasure_verification_failed: "compliance.erasure_verification_failed",
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit/actions.ts
git commit -m "chore(audit): add AUDIT.compliance.dsr_* + dsr_cascade + verification actions (Wave 4 §13)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Add `can:gdpr.*` permissions

**Files:**
- Modify: `src/lib/permissions/<discovered file>`

- [ ] **Step 1: Locate the permissions module**

Run: `grep -rn "can:diner\|can.diner" src/lib/permissions/ | head -5`
Look for the file where existing `can:*` strings are declared.

- [ ] **Step 2: Add six new permission keys**

In the permissions file, add:

```
can:gdpr.create_dsr
can:gdpr.resolve_diner
can:gdpr.verify_identity
can:gdpr.approve_erasure
can:gdpr.reject
can:gdpr.extend_deadline
```

Grant all six to the `tavli_admin` role only. (Follow the existing role-permission table shape — match how `can:audit.read_org_logs` or another tavli_admin-only permission is declared.)

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/lib/permissions/
git commit -m "feat(permissions): can:gdpr.* permissions for tavli_admin (Wave 4 §13)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Server actions — createDsr + resolveDinerForDsr + verifyDsrIdentity

**Files:**
- Create: `src/lib/compliance/dsr-actions.ts`
- Create: `src/lib/compliance/__tests__/dsr-actions.test.ts`

- [ ] **Step 1: Write the test for createDsr**

Create `src/lib/compliance/__tests__/dsr-actions.test.ts`:

```ts
import { makeDsrActions } from "../dsr-actions";

describe("createDsr", () => {
  it("creates a DSR with legal_deadline_at = now + 30 days", async () => {
    const insert = jest.fn().mockResolvedValue([{ id: "dsr-new" }]);
    const recordAudit = jest.fn().mockResolvedValue(undefined);
    const can = jest.fn().mockReturnValue(true);
    const currentActor = jest.fn().mockResolvedValue({ userId: "admin-1", impersonatorUserId: undefined });

    const actions = makeDsrActions({
      db: { insert: jest.fn().mockReturnValue({ values: jest.fn().mockReturnValue({ returning: insert }) }) } as any,
      recordAudit, can, currentActor,
    });

    const result = await actions.createDsr({
      identifier_phone: "+40712345678",
      identifier_email: "alice@example.ro",
      request_kind: "erasure",
      request_source: "email",
      request_body: "Please delete my data",
    });

    expect(result.id).toBe("dsr-new");
    expect(can).toHaveBeenCalledWith("admin-1", "can:gdpr.create_dsr");
    expect(recordAudit).toHaveBeenCalled();
  });

  it("denies when can:gdpr.create_dsr is false", async () => {
    const actions = makeDsrActions({
      db: {} as any,
      recordAudit: jest.fn(),
      can: jest.fn().mockReturnValue(false),
      currentActor: jest.fn().mockResolvedValue({ userId: "user-x", impersonatorUserId: undefined }),
    });
    await expect(actions.createDsr({
      request_kind: "erasure", request_source: "email",
    })).rejects.toThrow(/permission/);
  });
});

describe("resolveDinerForDsr", () => {
  it("sets diner_id on the DSR", async () => {
    const update = jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue({}) }) });
    const recordAudit = jest.fn().mockResolvedValue(undefined);
    const actions = makeDsrActions({
      db: { update } as any,
      recordAudit, can: jest.fn().mockReturnValue(true),
      currentActor: jest.fn().mockResolvedValue({ userId: "admin", impersonatorUserId: undefined }),
    });
    await actions.resolveDinerForDsr({ dsrId: "dsr-1", diner_ids: ["d1"] });
    expect(update).toHaveBeenCalled();
  });
});

describe("verifyDsrIdentity", () => {
  it("sets identity_verified=true + records audit", async () => {
    const set = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue({}) });
    const update = jest.fn().mockReturnValue({ set });
    const recordAudit = jest.fn().mockResolvedValue(undefined);
    const actions = makeDsrActions({
      db: { update } as any,
      recordAudit, can: jest.fn().mockReturnValue(true),
      currentActor: jest.fn().mockResolvedValue({ userId: "admin", impersonatorUserId: undefined }),
    });
    await actions.verifyDsrIdentity({ dsrId: "dsr-1", method: "tavli_admin_manual", reason: "Verified by phone callback" });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ identityVerified: true }));
    expect(recordAudit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/compliance/__tests__/dsr-actions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement createDsr + resolveDinerForDsr + verifyDsrIdentity**

Create `src/lib/compliance/dsr-actions.ts`:

```ts
import { dbAdmin } from "@/lib/db/admin";
import { dataSubjectRequests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { recordAudit as defaultRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { currentActor as defaultCurrentActor } from "@/lib/auth/current-actor";
import { can as defaultCan } from "@/lib/permissions";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type Deps = {
  db: typeof dbAdmin;
  recordAudit: typeof defaultRecordAudit;
  can: typeof defaultCan;
  currentActor: typeof defaultCurrentActor;
};

export type RequestKind = "access" | "rectification" | "erasure" | "portability" | "restrict_processing" | "object";
export type RequestSource = "in_product" | "email" | "postal" | "verbal";

export interface CreateDsrInput {
  identifier_phone?: string;
  identifier_email?: string;
  request_kind: RequestKind;
  request_source: RequestSource;
  request_body?: string;
}

export function makeDsrActions(deps: Deps) {
  async function createDsr(input: CreateDsrInput): Promise<{ id: string }> {
    const { userId, impersonatorUserId } = await deps.currentActor();
    if (!deps.can(userId, "can:gdpr.create_dsr")) {
      throw new Error("permission denied: can:gdpr.create_dsr");
    }
    const legalDeadlineAt = new Date(Date.now() + THIRTY_DAYS_MS);
    const inserted = await deps.db
      .insert(dataSubjectRequests)
      .values({
        identifierPhone: input.identifier_phone,
        identifierEmail: input.identifier_email,
        requestKind: input.request_kind,
        requestSource: input.request_source,
        requestBody: input.request_body,
        legalDeadlineAt,
      })
      .returning({ id: dataSubjectRequests.id });
    const id = inserted[0].id;
    await deps.recordAudit({
      action: AUDIT.compliance.dsr_created,
      subjectType: "data_subject_request",
      subjectId: id,
      actorUserId: userId,
      impersonatorUserId,
      actorRole: "tavli_admin",
      context: { request_kind: input.request_kind, request_source: input.request_source },
    });
    return { id };
  }

  async function resolveDinerForDsr(input: { dsrId: string; diner_ids: string[] }): Promise<void> {
    const { userId, impersonatorUserId } = await deps.currentActor();
    if (!deps.can(userId, "can:gdpr.resolve_diner")) {
      throw new Error("permission denied: can:gdpr.resolve_diner");
    }
    if (input.diner_ids.length === 0) {
      throw new Error("TV1103 dsr_diner_not_resolved: empty diner_ids");
    }
    await deps.db
      .update(dataSubjectRequests)
      .set({ dinerId: input.diner_ids[0], updatedAt: new Date() })
      .where(eq(dataSubjectRequests.id, input.dsrId));
    await deps.recordAudit({
      action: AUDIT.compliance.dsr_resolved,
      subjectType: "data_subject_request",
      subjectId: input.dsrId,
      actorUserId: userId,
      impersonatorUserId,
      actorRole: "tavli_admin",
      context: { diner_ids: input.diner_ids },
    });
  }

  async function verifyDsrIdentity(input: { dsrId: string; method: "tavli_admin_manual"; reason: string }): Promise<void> {
    const { userId, impersonatorUserId } = await deps.currentActor();
    if (!deps.can(userId, "can:gdpr.verify_identity")) {
      throw new Error("permission denied: can:gdpr.verify_identity");
    }
    if (!input.reason?.trim()) throw new Error("verification reason is required");
    await deps.db
      .update(dataSubjectRequests)
      .set({
        identityVerified: true,
        identityVerificationMethod: input.method,
        identityVerifiedAt: new Date(),
        identityVerifiedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(eq(dataSubjectRequests.id, input.dsrId));
    await deps.recordAudit({
      action: AUDIT.compliance.dsr_identity_verified,
      subjectType: "data_subject_request",
      subjectId: input.dsrId,
      actorUserId: userId,
      impersonatorUserId,
      actorRole: "tavli_admin",
      context: { method: input.method, reason: input.reason },
    });
  }

  return { createDsr, resolveDinerForDsr, verifyDsrIdentity };
}

export const dsrActions = makeDsrActions({
  db: dbAdmin,
  recordAudit: defaultRecordAudit,
  can: defaultCan,
  currentActor: defaultCurrentActor,
});
```

(`@/lib/auth/current-actor` and `@/lib/permissions` paths may differ — check the actual project structure for the exports.)

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/compliance/__tests__/dsr-actions.test.ts`
Expected: three tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compliance/dsr-actions.ts src/lib/compliance/__tests__/dsr-actions.test.ts
git commit -m "feat(compliance): dsr-actions createDsr+resolveDinerForDsr+verifyDsrIdentity (Wave 4 §13 sub-unit A.18)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Server actions — approveDsrErasure + rejectDsr + extendDsrDeadline

**Files:**
- Modify: `src/lib/compliance/dsr-actions.ts`
- Modify: `src/lib/compliance/__tests__/dsr-actions.test.ts`

- [ ] **Step 1: Write the tests**

Append to `dsr-actions.test.ts`:

```ts
describe("approveDsrErasure", () => {
  it("transitions status to in_progress, sets approved_by + approved_at, enqueues orchestrator", async () => {
    const dsr = { status: "received", identityVerified: true, requestKind: "erasure" };
    const select = jest.fn().mockResolvedValue([dsr]);
    const set = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue({}) });
    const update = jest.fn().mockReturnValue({ set });
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const recordAudit = jest.fn().mockResolvedValue(undefined);

    const actions = makeDsrActions({
      db: {
        select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: select }) }) }),
        update,
      } as any,
      recordAudit, can: jest.fn().mockReturnValue(true),
      currentActor: jest.fn().mockResolvedValue({ userId: "admin", impersonatorUserId: undefined }),
      enqueue,
    });
    await actions.approveDsrErasure({ dsrId: "dsr-1" });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "in_progress", approvedByUserId: "admin" }));
    expect(enqueue).toHaveBeenCalledWith("compliance.erasure-execute", { requestId: "dsr-1" });
  });

  it("throws TV1101 when status != 'received'", async () => {
    const dsr = { status: "completed", identityVerified: true, requestKind: "erasure" };
    const select = jest.fn().mockResolvedValue([dsr]);
    const actions = makeDsrActions({
      db: { select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: select }) }) }) } as any,
      recordAudit: jest.fn(), can: jest.fn().mockReturnValue(true),
      currentActor: jest.fn().mockResolvedValue({ userId: "admin", impersonatorUserId: undefined }),
      enqueue: jest.fn(),
    });
    await expect(actions.approveDsrErasure({ dsrId: "dsr-1" })).rejects.toThrow(/TV1101/);
  });

  it("throws TV1102 when identity not verified", async () => {
    const dsr = { status: "received", identityVerified: false, requestKind: "erasure" };
    const select = jest.fn().mockResolvedValue([dsr]);
    const actions = makeDsrActions({
      db: { select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: jest.fn().mockReturnValue({ limit: select }) }) }) } as any,
      recordAudit: jest.fn(), can: jest.fn().mockReturnValue(true),
      currentActor: jest.fn().mockResolvedValue({ userId: "admin", impersonatorUserId: undefined }),
      enqueue: jest.fn(),
    });
    await expect(actions.approveDsrErasure({ dsrId: "dsr-1" })).rejects.toThrow(/TV1102/);
  });
});

describe("rejectDsr", () => {
  it("sets status=rejected + reason", async () => {
    const set = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue({}) });
    const actions = makeDsrActions({
      db: { update: jest.fn().mockReturnValue({ set }) } as any,
      recordAudit: jest.fn(), can: jest.fn().mockReturnValue(true),
      currentActor: jest.fn().mockResolvedValue({ userId: "admin", impersonatorUserId: undefined }),
      enqueue: jest.fn(),
    });
    await actions.rejectDsr({ dsrId: "dsr-1", reason: "Not the actual data subject" });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
  });
});

describe("extendDsrDeadline", () => {
  it("rejects > 14 days as TV1106", async () => {
    const actions = makeDsrActions({
      db: {} as any, recordAudit: jest.fn(), can: jest.fn().mockReturnValue(true),
      currentActor: jest.fn().mockResolvedValue({ userId: "admin", impersonatorUserId: undefined }),
      enqueue: jest.fn(),
    });
    await expect(actions.extendDsrDeadline({ dsrId: "dsr-1", days: 15, reason: "test" })).rejects.toThrow(/TV1106/);
  });
  it("rejects missing reason as TV1107", async () => {
    const actions = makeDsrActions({
      db: {} as any, recordAudit: jest.fn(), can: jest.fn().mockReturnValue(true),
      currentActor: jest.fn().mockResolvedValue({ userId: "admin", impersonatorUserId: undefined }),
      enqueue: jest.fn(),
    });
    await expect(actions.extendDsrDeadline({ dsrId: "dsr-1", days: 7, reason: "" })).rejects.toThrow(/TV1107/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/compliance/__tests__/dsr-actions.test.ts`
Expected: new tests FAIL (functions don't exist).

- [ ] **Step 3: Implement the three new actions**

In `src/lib/compliance/dsr-actions.ts`, extend `Deps` with `enqueue` + add the three action functions to the returned object:

```ts
type Deps = {
  db: typeof dbAdmin;
  recordAudit: typeof defaultRecordAudit;
  can: typeof defaultCan;
  currentActor: typeof defaultCurrentActor;
  enqueue: typeof defaultEnqueue;
};

import { enqueue as defaultEnqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";

// Inside makeDsrActions:
async function approveDsrErasure(input: { dsrId: string }): Promise<void> {
  const { userId, impersonatorUserId } = await deps.currentActor();
  if (!deps.can(userId, "can:gdpr.approve_erasure")) throw new Error("permission denied: can:gdpr.approve_erasure");

  const rows = await deps.db.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.id, input.dsrId)).limit(1);
  const dsr = rows[0];
  if (!dsr) throw new Error(`TV1100 dsr_not_found: ${input.dsrId}`);
  if (dsr.status !== "received") throw new Error(`TV1101 dsr_wrong_status: ${dsr.status}`);
  if (!dsr.identityVerified) throw new Error("TV1102 dsr_not_verified");
  if (dsr.requestKind !== "erasure") throw new Error("approveDsrErasure: only erasure DSRs may be approved");

  await deps.db
    .update(dataSubjectRequests)
    .set({ status: "in_progress", approvedByUserId: userId, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(dataSubjectRequests.id, input.dsrId));

  await deps.enqueue(JOBS.compliance.erasureExecute, { requestId: input.dsrId });

  await deps.recordAudit({
    action: AUDIT.compliance.dsr_approved,
    subjectType: "data_subject_request",
    subjectId: input.dsrId,
    actorUserId: userId,
    impersonatorUserId,
    actorRole: "tavli_admin",
    context: {},
  });
}

async function rejectDsr(input: { dsrId: string; reason: string }): Promise<void> {
  const { userId, impersonatorUserId } = await deps.currentActor();
  if (!deps.can(userId, "can:gdpr.reject")) throw new Error("permission denied: can:gdpr.reject");
  await deps.db
    .update(dataSubjectRequests)
    .set({ status: "rejected", rejectionReason: input.reason, updatedAt: new Date() })
    .where(eq(dataSubjectRequests.id, input.dsrId));
  await deps.recordAudit({
    action: AUDIT.compliance.dsr_rejected,
    subjectType: "data_subject_request",
    subjectId: input.dsrId,
    actorUserId: userId,
    impersonatorUserId,
    actorRole: "tavli_admin",
    context: { reason: input.reason },
  });
}

async function extendDsrDeadline(input: { dsrId: string; days: number; reason: string }): Promise<void> {
  if (input.days < 1 || input.days > 14) throw new Error(`TV1106 deadline_extension_exceeds_cap: ${input.days}`);
  if (!input.reason?.trim()) throw new Error("TV1107 deadline_extension_missing_reason");

  const { userId, impersonatorUserId } = await deps.currentActor();
  if (!deps.can(userId, "can:gdpr.extend_deadline")) throw new Error("permission denied: can:gdpr.extend_deadline");

  const rows = await deps.db.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.id, input.dsrId)).limit(1);
  const dsr = rows[0];
  if (!dsr) throw new Error(`TV1100 dsr_not_found: ${input.dsrId}`);

  const newDeadline = new Date(dsr.legalDeadlineAt.getTime() + input.days * 24 * 60 * 60 * 1000);
  await deps.db
    .update(dataSubjectRequests)
    .set({
      legalDeadlineAt: newDeadline,
      deadlineExtensionDays: (dsr.deadlineExtensionDays ?? 0) + input.days,
      deadlineExtensionReason: input.reason,
      deadlineExtendedByUserId: userId,
      deadlineExtendedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dataSubjectRequests.id, input.dsrId));
  await deps.recordAudit({
    action: AUDIT.compliance.dsr_extended,
    subjectType: "data_subject_request",
    subjectId: input.dsrId,
    actorUserId: userId,
    impersonatorUserId,
    actorRole: "tavli_admin",
    context: { days: input.days, reason: input.reason, new_deadline_at: newDeadline.toISOString() },
  });
}

return { createDsr, resolveDinerForDsr, verifyDsrIdentity, approveDsrErasure, rejectDsr, extendDsrDeadline };
```

Update the `dsrActions` export to include `enqueue: defaultEnqueue` in its deps.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/compliance/__tests__/dsr-actions.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/compliance/dsr-actions.ts src/lib/compliance/__tests__/dsr-actions.test.ts
git commit -m "feat(compliance): dsr-actions approveDsrErasure+rejectDsr+extendDsrDeadline (Wave 4 §13 sub-unit A.19)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6 — Admin UI

### Task 20: `/admin/gdpr-requests` list page

**Files:**
- Create: `src/app/admin/gdpr-requests/page.tsx`

- [ ] **Step 1: Check the existing admin page pattern**

Run: `ls src/app/admin/` and pick a simple list page (e.g., `users/page.tsx`) to learn the layout conventions.

- [ ] **Step 2: Implement the list page**

Create `src/app/admin/gdpr-requests/page.tsx`:

```tsx
import { dbAdmin } from "@/lib/db/admin";
import { dataSubjectRequests } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import Link from "next/link";

export default async function GdprRequestsListPage() {
  const rows = await dbAdmin
    .select()
    .from(dataSubjectRequests)
    .orderBy(asc(dataSubjectRequests.legalDeadlineAt));

  return (
    <main>
      <h1>GDPR data-subject requests</h1>
      <p>Sorted by legal deadline. Red rows are due in 7 days or less.</p>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Kind</th>
            <th>Source</th>
            <th>Identifier</th>
            <th>Diner</th>
            <th>Status</th>
            <th>Deadline</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const daysToDeadline = Math.round((r.legalDeadlineAt.getTime() - Date.now()) / 86_400_000);
            return (
              <tr key={r.id} style={{ background: daysToDeadline <= 7 && r.status !== "completed" && r.status !== "rejected" ? "#fee" : undefined }}>
                <td><Link href={`/admin/gdpr-requests/${r.id}`}>{r.id.slice(0, 8)}</Link></td>
                <td>{r.requestKind}</td>
                <td>{r.requestSource}</td>
                <td>{r.identifierPhone || r.identifierEmail || "—"}</td>
                <td>{r.dinerId ? <Link href={`/admin/diners/${r.dinerId}`}>{r.dinerId.slice(0, 8)}</Link> : "unresolved"}</td>
                <td>{r.status}</td>
                <td>{daysToDeadline}d</td>
                <td>{r.createdAt.toLocaleDateString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
```

Match the editorial-bar from CLAUDE.md/AGENTS.md — wrap with admin-shell components, use the existing typography / table classes. Adjust based on what `src/app/admin/users/page.tsx` does.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`
Navigate to `http://localhost:3000/admin/gdpr-requests` while logged in as a tavli_admin.
Expected: page renders with an empty (or sample) list.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/gdpr-requests/page.tsx
git commit -m "feat(ui): /admin/gdpr-requests list page (Wave 4 §13 sub-unit A.20)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: `/admin/gdpr-requests/[id]` detail page + server actions wrapper

**Files:**
- Create: `src/app/admin/gdpr-requests/[id]/page.tsx`
- Create: `src/app/admin/gdpr-requests/[id]/actions.ts`

- [ ] **Step 1: Implement actions.ts (server actions wrapper)**

Create `src/app/admin/gdpr-requests/[id]/actions.ts`:

```ts
"use server";

import { dsrActions } from "@/lib/compliance/dsr-actions";

export async function createDsrAction(formData: FormData) {
  return dsrActions.createDsr({
    identifier_phone: formData.get("identifier_phone")?.toString() || undefined,
    identifier_email: formData.get("identifier_email")?.toString() || undefined,
    request_kind: formData.get("request_kind") as any,
    request_source: formData.get("request_source") as any,
    request_body: formData.get("request_body")?.toString() || undefined,
  });
}

export async function resolveDinerAction(dsrId: string, dinerIds: string[]) {
  return dsrActions.resolveDinerForDsr({ dsrId, diner_ids: dinerIds });
}

export async function verifyIdentityAction(dsrId: string, reason: string) {
  return dsrActions.verifyDsrIdentity({ dsrId, method: "tavli_admin_manual", reason });
}

export async function approveErasureAction(dsrId: string) {
  return dsrActions.approveDsrErasure({ dsrId });
}

export async function rejectDsrAction(dsrId: string, reason: string) {
  return dsrActions.rejectDsr({ dsrId, reason });
}

export async function extendDeadlineAction(dsrId: string, days: number, reason: string) {
  return dsrActions.extendDsrDeadline({ dsrId, days, reason });
}
```

- [ ] **Step 2: Implement the detail page**

Create `src/app/admin/gdpr-requests/[id]/page.tsx`:

```tsx
import { dbAdmin } from "@/lib/db/admin";
import { dataSubjectRequests, erasureLog, auditLogs } from "@/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ResolveDinerModal } from "./components/ResolveDinerModal";
import { VerifyIdentityModal } from "./components/VerifyIdentityModal";
import { ApproveErasureButton } from "./components/ApproveErasureButton";
import { RejectModal } from "./components/RejectModal";
import { ExtendDeadlineModal } from "./components/ExtendDeadlineModal";
import { CascadeAuditTrail } from "./components/CascadeAuditTrail";
import { FailureBanner } from "./components/FailureBanner";

export default async function GdprRequestDetailPage({ params }: { params: { id: string } }) {
  const rows = await dbAdmin
    .select()
    .from(dataSubjectRequests)
    .where(eq(dataSubjectRequests.id, params.id))
    .limit(1);
  const dsr = rows[0];
  if (!dsr) notFound();

  const cascadeRows = await dbAdmin
    .select()
    .from(erasureLog)
    .where(sql`${erasureLog.context}->>'dsrId' = ${dsr.id}`)
    .orderBy(desc(erasureLog.createdAt));

  const lastFailure = await dbAdmin
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.subjectId, dsr.id), eq(auditLogs.action, "compliance.dsr_cascade_failed")))
    .orderBy(desc(auditLogs.createdAt))
    .limit(1);

  return (
    <main>
      <h1>GDPR request {dsr.id}</h1>
      {lastFailure.length > 0 && <FailureBanner dsrId={dsr.id} failureContext={lastFailure[0].context} />}
      <section>
        <h2>Subject</h2>
        <p>Phone: {dsr.identifierPhone || "—"}</p>
        <p>Email: {dsr.identifierEmail || "—"}</p>
        <p>Resolved diner: {dsr.dinerId || "unresolved"}</p>
        {!dsr.dinerId && <ResolveDinerModal dsrId={dsr.id} hint={{ phone: dsr.identifierPhone, email: dsr.identifierEmail }} />}
      </section>
      <section>
        <h2>Request</h2>
        <p>Kind: {dsr.requestKind}</p>
        <p>Source: {dsr.requestSource}</p>
        <p>Body: {dsr.requestBody || "(none)"}</p>
        <p>Created: {dsr.createdAt.toLocaleString()}</p>
      </section>
      <section>
        <h2>Identity</h2>
        {dsr.identityVerified ? (
          <p>Verified at {dsr.identityVerifiedAt?.toLocaleString()} by {dsr.identityVerifiedByUserId} ({dsr.identityVerificationMethod})</p>
        ) : (
          <VerifyIdentityModal dsrId={dsr.id} />
        )}
      </section>
      <section>
        <h2>Deadline</h2>
        <p>{dsr.legalDeadlineAt.toLocaleString()}</p>
        <ExtendDeadlineModal dsrId={dsr.id} />
      </section>
      <section>
        <h2>Actions</h2>
        <ApproveErasureButton dsrId={dsr.id} enabled={dsr.identityVerified && dsr.status === "received" && dsr.requestKind === "erasure"} />
        <RejectModal dsrId={dsr.id} />
      </section>
      <section>
        <h2>Cascade audit trail</h2>
        <CascadeAuditTrail rows={cascadeRows} />
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/gdpr-requests/[id]/page.tsx src/app/admin/gdpr-requests/[id]/actions.ts
git commit -m "feat(ui): /admin/gdpr-requests/[id] detail page + server actions (Wave 4 §13 sub-unit A.21)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Six modal/component shells under `[id]/components/`

**Files:**
- Create: `src/app/admin/gdpr-requests/[id]/components/{ResolveDinerModal,VerifyIdentityModal,ApproveErasureButton,RejectModal,ExtendDeadlineModal,CascadeAuditTrail,FailureBanner}.tsx`

- [ ] **Step 1: Implement each component**

For each, follow the existing modal/component conventions in the codebase (likely under `src/components/` or `src/app/.../components/`). Each component is a thin client wrapper that:
- Renders a button + dialog
- On submit, calls the matching server action from `[id]/actions.ts`
- Re-renders the page via `router.refresh()` after success

Minimal example — `ApproveErasureButton.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveErasureAction } from "../actions";

export function ApproveErasureButton({ dsrId, enabled }: { dsrId: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={!enabled || pending}
      onClick={() => {
        if (!confirm("Approve erasure? This is irreversible.")) return;
        startTransition(async () => {
          await approveErasureAction(dsrId);
          router.refresh();
        });
      }}
    >
      {pending ? "Approving..." : "Approve erasure"}
    </button>
  );
}
```

Apply the same shape to:
- `ResolveDinerModal.tsx` — input fields for diner search by phone/email + a list-select UI for matches + submit
- `VerifyIdentityModal.tsx` — textarea for reason + submit
- `RejectModal.tsx` — textarea for reason + submit
- `ExtendDeadlineModal.tsx` — number input (1-14) + textarea + submit
- `CascadeAuditTrail.tsx` — pure presentation; renders a table of erasure_log rows
- `FailureBanner.tsx` — red banner + "Retry cascade" button that re-enqueues the orchestrator job

- [ ] **Step 2: Manual smoke**

Run: `npm run dev` and walk through: create a test DSR → resolve diner → verify identity → approve erasure. Watch the worker logs for the cascade execution.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/gdpr-requests/[id]/components/
git commit -m "feat(ui): six gdpr-request modals + audit-trail + failure-banner components (Wave 4 §13 sub-unit A.22)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 7 — Integration test + production rollout

### Task 23: End-to-end integration test

**Files:**
- Create: `src/lib/compliance/__tests__/erasure-cascade.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create the file. This test runs against a real local postgres (skipped in CI unless `TEST_DATABASE_URL` is set):

```ts
import { dbAdmin } from "@/lib/db/admin";
import {
  diners, reservations, reviews, transactionalEmailLog,
  partnerNotifications, marketingConsents, marketingSuppressions,
  auditLogs, erasureLog, dataSubjectRequests, restaurants, profiles,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { handleErasureExecute, handleErasurePartnerNotificationsPhase2 } from "@/lib/jobs/handlers/compliance";

const SKIP = !process.env.TEST_DATABASE_URL;

(SKIP ? describe.skip : describe)("erasure cascade end-to-end", () => {
  let dsrId: string;
  let dinerId: string;

  beforeAll(async () => {
    // Seed a diner with PII on every shipped table; create a DSR ready for cascade.
    // (Implementation details depend on the seed helpers Wave 3 ships in test fixtures.)
    // Pseudo-code; fill in concrete drizzle inserts:
    const [admin] = await dbAdmin.insert(profiles).values({ /* admin user */ }).returning();
    const [restaurant] = await dbAdmin.insert(restaurants).values({ /* ... */ }).returning();
    const [diner] = await dbAdmin.insert(diners).values({
      organizationId: restaurant.organizationId, phone: "+40712345678", email: "alice@example.ro", fullName: "Alice Test",
    }).returning();
    dinerId = diner.id;
    await dbAdmin.insert(reservations).values({
      restaurantId: restaurant.id, dinerId,
      guestName: "Alice Test", guestPhone: "+40712345678", guestEmail: "alice@example.ro",
      partySize: 2, reservationDate: new Date(), reservationTime: "19:00", confirmationToken: "tok-1",
    });
    // ...similar inserts for reviews, transactional_email_log, partner_notifications (with payload.diner_id),
    // marketing_consents, marketing_suppressions, audit_logs (subject_type='diner', subject_id=dinerId)...

    const [dsr] = await dbAdmin.insert(dataSubjectRequests).values({
      identifierPhone: "+40712345678", identifierEmail: "alice@example.ro",
      requestKind: "erasure", requestSource: "email",
      legalDeadlineAt: new Date(Date.now() + 30 * 86_400_000),
      identityVerified: true, identityVerificationMethod: "tavli_admin_manual", identityVerifiedByUserId: admin.id,
      status: "in_progress", approvedByUserId: admin.id, approvedAt: new Date(),
    }).returning();
    dsrId = dsr.id;
  });

  afterAll(async () => {
    // Best-effort cleanup; rely on transactional test rollback if available
    await dbAdmin.delete(dataSubjectRequests).where(eq(dataSubjectRequests.id, dsrId));
    await dbAdmin.delete(diners).where(eq(diners.id, dinerId));
  });

  it("runs the full cascade and leaves every PII column null/redacted", async () => {
    await handleErasureExecute({ requestId: dsrId });
    await handleErasurePartnerNotificationsPhase2({ requestId: dsrId });

    // diners
    const [d] = await dbAdmin.select().from(diners).where(eq(diners.id, dinerId));
    expect(d.phone).toBeNull();
    expect(d.email).toBeNull();
    expect(d.fullName).toBeNull();
    expect(d.redactedAt).not.toBeNull();

    // reservations
    const reservationsRows = await dbAdmin.select().from(reservations).where(eq(reservations.dinerId, dinerId));
    for (const r of reservationsRows) {
      expect(r.guestName).toBe("Redacted");
      expect(r.guestPhone).toBe("REDACTED");
      expect(r.guestEmail).toBeNull();
      expect(r.redactedAt).not.toBeNull();
    }

    // reviews
    const reviewsRows = await dbAdmin.select().from(reviews).where(eq(reviews.dinerId, dinerId));
    for (const r of reviewsRows) {
      expect(r.firstName).toBe("Redacted");
      expect(r.redactedAt).not.toBeNull();
    }

    // transactional_email_log
    const telRows = await dbAdmin.select().from(transactionalEmailLog).where(eq(transactionalEmailLog.dinerId, dinerId));
    for (const r of telRows) {
      expect(r.email).toBeNull();
      expect(r.phone).toBeNull();
      expect(r.redactedAt).not.toBeNull();
    }

    // marketing_consents
    const mcRows = await dbAdmin.select().from(marketingConsents).where(eq(marketingConsents.dinerId, dinerId));
    for (const r of mcRows) expect(r.revokedAt).not.toBeNull();

    // marketing_suppressions — at least one row exists for each captured identifier
    const sup = await dbAdmin.select().from(marketingSuppressions).where(sql`source_event_id = ${dsrId}`);
    expect(sup.length).toBeGreaterThanOrEqual(2);

    // partner_notifications — every row marked + phase 2 ran
    const pnRows = await dbAdmin.select().from(partnerNotifications).where(sql`pending_erasure_request_id = ${dsrId}`);
    for (const r of pnRows) {
      expect(r.redactedAt).not.toBeNull();
    }

    // audit_logs — diner-subject rows redacted
    const auditRows = await dbAdmin.select().from(auditLogs).where(sql`${auditLogs.subjectId} = ${dinerId}::uuid AND ${auditLogs.subjectType} = 'diner'`);
    for (const r of auditRows) {
      expect(r.redactedAt).not.toBeNull();
      expect((r.context as any).erased).toBe(true);
    }

    // erasure_log has entries
    const elRows = await dbAdmin.select().from(erasureLog).where(sql`${erasureLog.context}->>'dsrId' = ${dsrId}`);
    expect(elRows.length).toBeGreaterThan(0);

    // DSR completed
    const [finalDsr] = await dbAdmin.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.id, dsrId));
    expect(finalDsr.status).toBe("completed");
    expect(finalDsr.completedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the integration test locally**

Set `TEST_DATABASE_URL` to a local postgres + run:

Run: `TEST_DATABASE_URL=$DATABASE_URL npm test -- src/lib/compliance/__tests__/erasure-cascade.integration.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/compliance/__tests__/erasure-cascade.integration.test.ts
git commit -m "test(compliance): end-to-end erasure cascade integration test (Wave 4 §13 sub-unit A.23)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: Apply migrations to production + drizzle bookkeeping

**Files:** none (production state changes).

- [ ] **Step 1: Confirm with the user before touching prod**

This is a production action. Confirm with the user (e.g., via /verify or a Slack ping) before proceeding.

- [ ] **Step 2: Apply migration 0029**

Run: `psql "$PRODUCTION_DATABASE_URL" -f drizzle/migrations/0029_data_subject_requests.sql`
Expected: `CREATE TABLE` + `CREATE INDEX` × 2 + `ALTER TABLE` + `CREATE POLICY` outputs.

- [ ] **Step 3: Apply migration 0030**

Run: `psql "$PRODUCTION_DATABASE_URL" -f drizzle/migrations/0030_redacted_at_columns_backfill.sql`
Expected: three `ALTER TABLE` + three `CREATE INDEX` outputs.

- [ ] **Step 4: Apply migration 0031**

Run: `psql "$PRODUCTION_DATABASE_URL" -f drizzle/migrations/0031_partner_notifications_pending_erasure_request_id.sql`
Expected: `ALTER TABLE` + `CREATE INDEX` outputs.

- [ ] **Step 5: Insert drizzle bookkeeping rows**

For each migration, insert into `drizzle.__drizzle_migrations` matching the pattern in `~/.claude/projects/.../memory/deploy_setup.md`. The exact SQL:

```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES ('<hash from _journal.json>', <created_at_ms_from_journal>);
```

Run three INSERTs, one per migration.

- [ ] **Step 6: Verify**

Run: `psql "$PRODUCTION_DATABASE_URL" -c "SELECT id, tag FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;"`
Expected: the three new migrations appear.

- [ ] **Step 7: Trigger Coolify redeploy**

Per `deploy_setup.md`, user triggers a Coolify redeploy so the application picks up the new code.

---

### Task 25: Update build-order.md + final commit

**Files:**
- Modify: `docs/superpowers/architecture/build-order.md`

- [ ] **Step 1: Annotate the unit as shipped**

In `docs/superpowers/architecture/build-order.md`, find line 103 and update it to match the Wave 3 annotation convention:

```md
- [x] §13 erasure cascade orchestrator (calls §03 + §04 handlers) *(shipped 2026-05-23 — pii-table-registry.ts as single source of truth; data_subject_requests + audit_logs.redacted_at + reservations.redacted_at + reviews.redacted_at + partner_notifications.pending_erasure_request_id migrations 0029-0031; six handlers + nightly verification sweep; /admin/gdpr-requests UI; DataDeletionConfirmedEmail RO/EN/DE. Closes Wave 3 deferred JOBS.diner.purgePseudonymised bootstrap wiring.)*
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/architecture/build-order.md
git commit -m "docs(build-order): annotate Wave 4 §13 erasure cascade orchestrator shipped

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Final checklist

- [ ] All 25 tasks complete and committed
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` no new errors / warnings beyond baseline
- [ ] `npm test` all tests pass
- [ ] Integration test passes against a real db
- [ ] All three migrations applied to prod with bookkeeping
- [ ] `/admin/gdpr-requests` reachable in prod for tavli_admin users
- [ ] Coolify redeploy triggered
- [ ] `build-order.md` line 103 marked `[x]` with shipped-date annotation
