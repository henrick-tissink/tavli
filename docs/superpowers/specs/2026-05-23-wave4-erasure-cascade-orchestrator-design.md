# Wave 4 — §13 erasure cascade orchestrator (design)

**Date:** 2026-05-23
**Owner:** Tavli v1 build
**Wave / unit:** Wave 4 · §13 erasure cascade orchestrator (build-order line 103)
**Status:** spec — pending implementation plan
**Predecessor primitives (Wave 3, shipped):** `pseudonymiseDiner` (4-table cascade), `partner_notifications.pending_erasure_at` + `redacted_at` columns, `erasure_log`, `marketing_consents`, `marketing_suppressions`, unified `transactional_email_log` with `redacted_at`, `sendTransactionalEmail` + `resolveLocale` + EmailShell wrapper.

---

## 1. Scope

Ship v1 of GDPR Article 17 (right to erasure) for Tavli:

- A tracking table for data-subject requests.
- A registry naming every PII-bearing table in the v1 schema (the single source of truth for what's PII).
- A pg-boss orchestrator that executes the cascade described in §13 §6.3 against the tables that exist today, while stubbing handlers for tables that ship in later Waves.
- A nightly verification sweep that re-reads redacted rows and Sentry-alerts on any residual PII.
- A Tavli-admin-only intake surface at `/admin/gdpr-requests`.
- A minimal `DataDeletionConfirmedEmail` template (RO + EN + DE) sent on cascade completion.
- Wiring for the Wave-3-shipped `JOBS.diner.purgePseudonymised` handler at worker bootstrap, scheduled at +30 days per resolved diner.

### Out of scope

- The `data_subject_requests` retention seed (1825 days, hard_delete) — `retention_policies` table doesn't exist yet; sibling Wave 4 unit (DSR + retention + purge) inserts it.
- In-product diner-self-service intake — deferred to a later Wave; v1 is admin-only.
- Partner-admin (org-side) intake — out of scope.
- Erasure of `auth.users` / `profiles` for a venue owner — handled separately via org cancellation flow (Wave 5).
- Handlers for `billing_audit_log` (Wave 5), `marketing_sends` / `customer_consents` / `marketing_consent_audit` (Wave 7), `walkin_queue` (Wave 4 §08), `corporate_lead_intents` (Wave 4 §10) — registry stubs only.
- Architecture-doc reconciliation between "anonymiseDiner" (spec language) and "pseudonymiseDiner" (Wave 3 shipped name) — deferred to a later doc-only pass.

---

## 2. Data model

### 2.1 Migration 0029 — `data_subject_requests`

Ships the table verbatim from §13 §4.2:

```sql
create table data_subject_requests (
  id uuid primary key default gen_random_uuid(),

  diner_id uuid references diners(id) on delete set null,
  identifier_phone varchar(20),
  identifier_email varchar(255),

  request_kind varchar(40) not null,
  request_source varchar(40) not null,
  request_body text,

  identity_verified boolean not null default false,
  identity_verification_method varchar(60),
  identity_verified_at timestamptz,
  identity_verified_by_user_id uuid references auth.users(id) on delete set null,

  status varchar(20) not null default 'received',
  rejection_reason text,
  completed_at timestamptz,

  legal_deadline_at timestamptz not null,

  deadline_extension_days smallint not null default 0,
  deadline_extension_reason text,
  deadline_extended_by_user_id uuid references auth.users(id) on delete set null,
  deadline_extended_at timestamptz,

  export_storage_path text,
  export_signed_url_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_dsr_deadline_extension_cap check (deadline_extension_days between 0 and 14),
  constraint chk_dsr_deadline_extension_reason check (
    (deadline_extension_days = 0 and deadline_extension_reason is null)
    or (deadline_extension_days > 0 and deadline_extension_reason is not null and deadline_extended_by_user_id is not null)
  )
);

create index data_subject_requests_status on data_subject_requests (status, legal_deadline_at) where status in ('received', 'in_progress');
create index data_subject_requests_diner on data_subject_requests (diner_id) where diner_id is not null;
```

**RLS:** service-role writes only (no INSERT/UPDATE/DELETE policy for authenticated). Read policy: Tavli admins (`profiles.role = 'tavli_admin'`) only. Diner-self-read is deferred until in-product intake ships.

### 2.2 Migration 0030 — `audit_logs.redacted_at`

```sql
alter table audit_logs add column redacted_at timestamptz null;
create index audit_logs_redacted_at_idx on audit_logs (redacted_at) where redacted_at is not null;
```

No backfill. Default null means "not yet redacted". The `audit_logs` cascade handler sets this column when it overwrites `context` per §13 §6.3 step (i).

### 2.3 Migration 0031 — `partner_notifications.pending_erasure_request_id`

Wave 3's migration 0028 added `pending_erasure_at` + `redacted_at` to `partner_notifications` but did NOT add the FK back to the DSR that triggered the phase 1 mark. Phase 2 needs that link to know which marked rows belong to which DSR (so a re-run of phase 2 for a specific DSR can target only its own marks):

```sql
alter table partner_notifications
  add column pending_erasure_request_id uuid null
  references data_subject_requests(id) on delete set null;

create index partner_notifications_pending_erasure_request_idx
  on partner_notifications (pending_erasure_request_id)
  where pending_erasure_request_id is not null;
```

The `on delete set null` lets a DSR row age out under its 5-year retention without orphaning the partner_notifications rows (which by then are fully redacted or deleted via phase 2 anyway).

### 2.4 Retention seed — documented, not inserted

The `retention_policies` row for `data_subject_requests` (1825 days, `hard_delete`, applies_to_column `created_at`) is documented here for the sibling DSR/retention/purge unit. This unit does not insert it because the `retention_policies` table does not yet exist.

### 2.5 Drizzle bookkeeping

After applying all three migrations in production via the manual `psql -f` convention, insert bookkeeping rows into `drizzle.__drizzle_migrations` matching the migration filenames (per `~/.claude/projects/.../memory/deploy_setup.md`).

---

## 3. PII table registry

### 3.1 The module

`src/lib/compliance/pii-table-registry.ts` — single source of truth for what's PII in the v1 schema. Used by the orchestrator (to iterate handlers) and the verification sweep (to query redacted-row state).

```ts
export type HandlerDeps = {
  db: PostgresJsDatabase;                    // service-role
  dsrId: string;
  dinerIds: string[];                        // resolved set (cross-org)
  capturedIdentifiers: Array<{               // pre-redaction snapshot
    dinerId: string;
    phone: string | null;
    email: string | null;
  }>;
};

export type HandlerResult = {
  tableName: string;
  rowsRedacted: number;
  skipped: boolean;                          // true when nothing to redact (idempotent re-run)
};

export type VerifyDeps = { db: PostgresJsDatabase };
export type VerificationResult = {
  tableName: string;
  rowsScanned: number;
  rowsWithResidualPii: number;
  residualRowIds: string[];                  // up to 100 sample ids
};

export type PiiTableEntry = {
  tableName: string;
  shipped: boolean;
  handler: ((deps: HandlerDeps) => Promise<HandlerResult>) | null;
  verificationQuery: ((deps: VerifyDeps) => Promise<VerificationResult>) | null;
  twoPhase: boolean;
  piiColumns: string[];                      // documents PII surface for §15.2 RoPA
  coveredBy?: string;                        // set when redaction happens inside another handler
  defaultReason: 'gdpr_art_17' | 'gdpr_art_17_with_fiscal_retention';
};

export const PII_TABLE_REGISTRY: readonly PiiTableEntry[] = [/* see §3.2 */];
```

### 3.2 Registry contents — cascade order

The registry is ordered for orchestrator iteration. Order rationale: `marketing_suppressions` first (needs pre-redaction phone/email); `marketing_consents` second (depends on diner_id only); `partner_notifications` phase 1 next (marker step); `diners` runs `pseudonymiseDiner` which atomically covers diners + reservations + reviews + transactional_email_log; `audit_logs` last for the chunked context-replacement sweep. `partner_notifications` phase 2 is a separate scheduled job, not iterated here.

| # | tableName | shipped | handler | piiColumns | coveredBy | twoPhase | Wave when shipped |
|---|---|---|---|---|---|---|---|
| 1 | marketing_suppressions | ✓ | `handleMarketingSuppressions` | `identifier` | — | false | Wave 3 |
| 2 | marketing_consents | ✓ | `handleMarketingConsents` | `(revoked via revoked_at)` | — | false | Wave 3 |
| 3 | partner_notifications | ✓ | `handlePartnerNotificationsPhase1` | `payload` | — | true | Wave 3 |
| 4 | diners | ✓ | `handleDiners` (wraps `pseudonymiseDiner`) | `phone, email, first_name, last_name, notes, preferences` | — | false | Wave 3 |
| 5 | reservations | ✓ | null | `guest_name, guest_phone, guest_email` | `diners` | false | Wave 1 |
| 6 | reviews | ✓ | null | `first_name` | `diners` | false | Wave 3 |
| 7 | transactional_email_log | ✓ | null | `email, phone` | `diners` | false | Wave 3 |
| 8 | audit_logs | ✓ | `handleAuditLogs` | `context` | — | false | Wave 1 |
| 9 | billing_audit_log | ✗ | null (stub) | `context` | — | false | Wave 5 |
| 10 | marketing_sends | ✗ | null (stub) | `email, phone` | — | false | Wave 7 |
| 11 | customer_consents | ✗ | null (stub) | `(revoked via revoked_at)` | — | false | Wave 7 |
| 12 | marketing_consent_audit | ✗ | null (stub) | `context` | — | false | Wave 7 |
| 13 | walkin_queue | ✗ | null (stub) | `guest_name, guest_phone` | — | false | Wave 4 §08 |
| 14 | corporate_lead_intents | ✗ | null (stub) | `(tbd)` | — | false | Wave 4 §10 |

The orchestrator processes entry 9 (partner_notifications phase 2) by enqueueing a separate scheduled job — it is NOT a registry entry; the registry's row #3 represents phase 1 only.

### 3.3 Stub semantics

Entries with `shipped: false` are silently skipped by both the orchestrator and the verification sweep. The signal "implement when Wave N ships X" lives in the registry file itself as `shipped: false` plus a `// TODO Wave N` comment. No Sentry warnings; no runtime noise. When a future Wave ships its table, flipping `shipped: true` + providing the handler + verificationQuery is the only code change required.

### 3.4 Verification queries

Every shipped entry — including those with `handler: null, coveredBy: 'diners'` — must expose a `verificationQuery`. Per-table verification is what proves the cascade actually worked; a coveredBy entry's verificationQuery confirms the sibling handler also touched this table's rows.

---

## 4. Handlers

Each handler lives in `src/lib/compliance/handlers/<table>.ts` and follows the DI-seam factory pattern:

```ts
export function makeHandleDiners(deps: HandlerFactoryDeps) {
  return async function handleDiners(d: HandlerDeps): Promise<HandlerResult> { /* ... */ };
}
export const handleDiners = makeHandleDiners(productionDeps);
```

### 4.1 `handleMarketingSuppressions`

For every captured `(dinerId, phone, email)`:
- If `phone` is non-null, `INSERT INTO marketing_suppressions (channel, identifier, source, source_event_id) VALUES ('sms', $phone, 'gdpr_erasure', $dsrId) ON CONFLICT (channel, lower(identifier)) DO NOTHING` (also `'whatsapp'` for the same phone).
- If `email` is non-null, same for `('email', $email, …)`.
- Returns count of new rows inserted.

Idempotent via ON CONFLICT. Re-run is a no-op.

### 4.2 `handleMarketingConsents`

`UPDATE marketing_consents SET revoked_at = now(), revoke_reason = 'gdpr_erasure', revoke_source_event_id = $dsrId WHERE diner_id = ANY($dinerIds) AND revoked_at IS NULL`. Returns affected row count.

Idempotent: re-run targets only rows where `revoked_at IS NULL`.

### 4.3 `handlePartnerNotificationsPhase1`

The diner-to-notification join path is non-trivial: `partner_notifications` (per `src/lib/db/schema.ts` at spec time) has no direct `diner_id` column. Diner association lives inside the JSONB `payload` — most notification kinds reference `payload->>'reservation_id'`, which joins back to `reservations.diner_id`. Other kinds (e.g., diner-merge or diner-pseudonymisation operator alerts) may carry `payload->>'diner_id'` directly.

The handler does NOT regex-scan the payload (per §13 §6.3 step (h) — explicitly prohibited). Instead it executes a union of well-known join paths:

```sql
UPDATE partner_notifications pn
   SET pending_erasure_at = now(),
       pending_erasure_request_id = $dsrId
 WHERE pending_erasure_at IS NULL
   AND pn.id IN (
       -- path 1: notifications about reservations owned by the diner
       SELECT pn1.id
         FROM partner_notifications pn1
         JOIN reservations r
           ON r.id::text = (pn1.payload->>'reservation_id')
        WHERE r.diner_id = ANY($dinerIds)
       UNION
       -- path 2: notifications that directly reference the diner_id
       SELECT pn2.id
         FROM partner_notifications pn2
        WHERE (pn2.payload->>'diner_id') = ANY($dinerIds::text[])
   )
RETURNING id;
```

The set of recognised join paths is encoded as a constant in `src/lib/compliance/handlers/partner-notifications-phase1.ts` next to the SQL. When §04 adds a new `notification_kind` that references a diner via a fresh payload path, the handler gets a new SELECT in the UNION. Adding a new kind without registering its join path is a known-and-flagged gap — captured as a follow-up entry in §15.

Writes one `erasure_log` row per affected notification (`table_name = 'partner_notifications'`, `phase = 1`, `reason = 'gdpr_art_17'`).

Idempotent: re-run targets only rows where `pending_erasure_at IS NULL`.

### 4.4 `handleDiners` (wraps `pseudonymiseDiner`)

For each `dinerId` in `dinerIds`, calls Wave 3's `pseudonymiseDiner(dinerId, { reason: 'gdpr_erasure', dsrId })`. That function already cascades to reservations + reviews + transactional_email_log and writes `erasure_log` rows; this handler just iterates and aggregates the row counts.

Idempotent: `pseudonymiseDiner` checks `diners.anonymised_at IS NULL` before redacting.

### 4.5 `handleAuditLogs`

Two-pass chunked update, 1000 rows per transaction per pass. Pass 1 targets rows where `subject_type = 'diner' AND subject_id = ANY($dinerIds)`. Pass 2 targets rows where `subject_type = 'reservation' AND subject_id IN (SELECT id FROM reservations WHERE diner_id = ANY($dinerIds))` — these are the diner-adjacent reservation audit rows whose `context` often carries guest_phone/guest_email mirrors of the reservation row.

```sql
UPDATE audit_logs
   SET redacted_at = now(),
       context = jsonb_build_object(
         'erased', true,
         'erasure_log_id', $erasureLogId,
         'original_action', action
       )
 WHERE id IN (
   SELECT id FROM audit_logs
    WHERE <pass predicate>
      AND redacted_at IS NULL
    ORDER BY id
    LIMIT 1000
 )
RETURNING id;
```

Loops until 0 rows updated for each pass. Per chunk: insert N rows into `erasure_log` (`table_name = 'audit_logs'`, `fields_erased = ['context']`, `reason = 'gdpr_art_17'`). Each chunk is its own transaction so a chunk failure leaves committed work behind and the retry resumes.

Limitation acknowledged: `audit_logs` rows with `subject_type` outside {`diner`, `reservation`} that nevertheless contain diner PII in `context` (e.g., a `review` audit whose context carries the diner's first name) are NOT redacted in v1. The architectural fix is documented in §13 §6.3 step (i) — domain code should write FK ids into `context`, not PII strings. Until that refactor lands, the verification sweep treats these rows as if they have no PII (their `redacted_at` is still null, so the sweep never queries them). Tracked as follow-up item §15.4 below.

Idempotent via `AND redacted_at IS NULL`.

### 4.6 `handlePartnerNotificationsPhase2` (separate scheduled job, not registry-iterated)

`JOBS.compliance.erasurePartnerNotificationsPhase2(requestId)` runs +5 minutes after phase 1. For each notification row with `pending_erasure_request_id = $dsrId AND redacted_at IS NULL`:
- If the row's `created_at < now() - interval '30 days'` AND `kind IN ('reservation_created', 'reservation_modified', 'reservation_cancelled')` (the delivered-transactional kinds whose operational value has lapsed): hard-delete the row. The set of "hard-delete-eligible kinds" is encoded as a constant in `src/lib/compliance/handlers/partner-notifications-phase2.ts` and grows as §04 adds new transactional notification kinds.
- Otherwise: `UPDATE partner_notifications SET redacted_at = now(), payload = jsonb_build_object('erased', true, 'erasure_log_id', $erasureLogId, 'original_kind', kind) WHERE id = $rowId`.

Writes a second `erasure_log` row per affected notification (`phase = 2`). Note: the schema column is `kind` (not `notification_kind`) per the current `src/lib/db/schema.ts`.

---

## 5. Orchestrator job — `JOBS.compliance.erasureExecute(requestId)`

### 5.1 Flow

1. Load DSR row by id. Assert `status = 'in_progress'` (else throw TV1101) and `identity_verified = true` (else throw TV1102).
2. Resolve diner ids: start with `data_subject_requests.diner_id` (if set), then add any `diners.id` whose `phone = identifier_phone OR email = identifier_email` (cross-org). For each resolved diner, capture pre-redaction `(diner_id, phone, email)` into `capturedIdentifiers`.
3. Iterate `PII_TABLE_REGISTRY` in order. For each entry with `shipped: true && handler !== null`, await `handler({ db, dsrId, dinerIds, capturedIdentifiers })`. Skip stubs and coveredBy entries. Accumulate results into a summary array.
4. Enqueue `JOBS.compliance.erasurePartnerNotificationsPhase2(requestId)` with `startAfter: '5 minutes'`.
5. `UPDATE data_subject_requests SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $dsrId`.
6. Call `recordAudit({ action: AUDIT.compliance.erasure_executed, subjectType: 'data_subject_request', subjectId: dsrId, context: { dinerIds, summary, capturedIdentifierCount: capturedIdentifiers.length } })`.
7. For each resolved `dinerId`, enqueue `JOBS.diner.purgePseudonymised(dinerId)` with `startAfter: '30 days'`. (The handler itself was shipped by Wave 3; this unit also registers it at worker bootstrap — closes the Wave 3 deferred follow-up.)
8. If any captured identifier has a non-null `email`, call `sendTransactionalEmail({ to: email, template: 'data_deletion_confirmed', locale: resolveDinerLocale(dinerId) ?? 'ro', params: { dsrId, completedAt: now } })` once per unique email. Failures here do NOT roll back the cascade; they log to `transactional_email_log` per Wave 3's substrate.

### 5.2 Failure semantics

Any handler exception bubbles up to pg-boss. pg-boss retries 3× with exponential backoff (default Wave 3 retry policy). After 3 failures:
- DSR remains in `status = 'in_progress'` (no auto-rollback — partial cascade state is the truth).
- `recordAudit({ action: AUDIT.compliance.erasure_failed, … })` with the error.
- Sentry alert at `level: 'error'` with `dsrId`, the failing handler's `tableName`, the error message.
- The `/admin/gdpr-requests/[id]` detail page surfaces the failure state with a "Retry" button that re-enqueues the orchestrator job.

### 5.3 Idempotency contract

Every handler is independently idempotent. Re-running the orchestrator on a partially-completed DSR is the recovery path — it re-runs every handler; handlers no-op on already-redacted rows. The DSR's `status` field is the orchestrator's own state machine; handlers do not read it.

---

## 6. Verification sweep — `JOBS.compliance.erasureVerify`

### 6.1 Schedule

Nightly via pg-boss `schedule()` at 03:00 UTC. Same cadence as Wave 3's `JOBS.diner.recomputeDinerAggregates`.

### 6.2 Flow

1. Iterate `PII_TABLE_REGISTRY`. For each entry with `shipped: true` AND `verificationQuery !== null`, call `verificationQuery({ db })`.
2. Aggregate results into a `VerificationSweepReport`.
3. If `report.totalResidualPiiRows > 0`:
   - Sentry alert at `level: 'error'` with the full report (table breakdowns + sample row ids).
   - `recordAudit({ action: AUDIT.compliance.erasure_verification_failed, context: report })`.
4. Else: `recordAudit({ action: AUDIT.compliance.erasure_verification_passed, context: { rowsScannedByTable } })`. No Sentry.

### 6.3 Per-table query shape

For column-PII (e.g., `reservations`):
```sql
SELECT id FROM reservations
 WHERE pseudonymised_at IS NOT NULL
   AND (guest_name IS NOT NULL OR guest_phone IS NOT NULL OR guest_email IS NOT NULL)
 LIMIT 100;
```

For JSONB-PII (e.g., `audit_logs`):
```sql
SELECT id FROM audit_logs
 WHERE redacted_at IS NOT NULL
   AND COALESCE(context->>'erased', 'false') != 'true'
 LIMIT 100;
```

Each query returns up to 100 sample ids for the Sentry payload + a full count of residual rows.

---

## 7. Server actions

`src/lib/compliance/dsr-actions.ts` — all factory-pattern + DI seams.

| Action | Permission | Behaviour |
|---|---|---|
| `createDsr(input)` | `can:gdpr.create_dsr` | Validates `request_kind ∈ {access,rectification,erasure,portability,restrict_processing,object}` and `request_source ∈ {in_product,email,postal,verbal}`. Computes `legal_deadline_at = now + interval '30 days'`. INSERTs. `recordAudit(AUDIT.compliance.dsr_created)`. Returns DSR id. |
| `resolveDinerForDsr({ dsrId, diner_ids[] })` | `can:gdpr.resolve_diner` | Sets `data_subject_requests.diner_id = diner_ids[0]` (primary). The cascade re-resolves cross-org at run time via phone/email match, so the primary is a UI affordance. `recordAudit(AUDIT.compliance.dsr_resolved)`. |
| `verifyDsrIdentity({ dsrId, method, reason })` | `can:gdpr.verify_identity` | Validates `method = 'tavli_admin_manual'` (only v1 value). `reason` is mandatory free text. UPDATE: sets `identity_verified = true`, `identity_verification_method`, `identity_verified_at = now`, `identity_verified_by_user_id = currentUserId`. `recordAudit(AUDIT.compliance.dsr_identity_verified, context: { reason })`. |
| `approveDsrErasure({ dsrId })` | `can:gdpr.approve_erasure` | Asserts `identity_verified = true` (else TV1102) and `status = 'received'` (else TV1101) and `request_kind = 'erasure'` (else throw). UPDATE: `status = 'in_progress'`. Enqueues `JOBS.compliance.erasureExecute(dsrId)`. `recordAudit(AUDIT.compliance.dsr_approved)`. |
| `rejectDsr({ dsrId, reason })` | `can:gdpr.reject` | Asserts `status IN ('received', 'in_progress')`. UPDATE: `status = 'rejected'`, `rejection_reason = reason`. `recordAudit(AUDIT.compliance.dsr_rejected)`. |
| `extendDsrDeadline({ dsrId, days, reason })` | `can:gdpr.extend_deadline` | Validates `days ∈ [1, 14]` (else TV1106) and `reason` is non-empty (else TV1107). Enforced also by CHECK constraint. UPDATE: bumps `legal_deadline_at += days`, records `deadline_extension_days`, reason, extended_by, extended_at. `recordAudit(AUDIT.compliance.dsr_extended)`. |

All actions thread `currentActor()` for `impersonator_user_id` audit threading + `actor_role = 'tavli_admin'`.

### 7.1 Permission rows

Six new permission strings added to `src/lib/permissions/`, all granted to `tavli_admin` role only. v1 does not grant any GDPR permission to `venue_owner` or other org roles.

### 7.2 AUDIT.compliance registry entries

Add to `src/lib/audit/actions.ts`:
- `AUDIT.compliance.dsr_created`
- `AUDIT.compliance.dsr_resolved`
- `AUDIT.compliance.dsr_identity_verified`
- `AUDIT.compliance.dsr_approved`
- `AUDIT.compliance.dsr_rejected`
- `AUDIT.compliance.dsr_extended`
- `AUDIT.compliance.erasure_executed`
- `AUDIT.compliance.erasure_failed`
- `AUDIT.compliance.erasure_verification_passed`
- `AUDIT.compliance.erasure_verification_failed`

---

## 8. Admin UI

### 8.1 `/admin/gdpr-requests` (list)

- Table: `id` (truncated), `request_kind`, `request_source`, `identifier_phone || identifier_email`, `diner_id` (linked profile or "unresolved"), `status` (badge), `legal_deadline_at` (relative time, red when ≤7 days), `created_at`.
- Default filter: `status IN ('received', 'in_progress')`, sorted by `legal_deadline_at ASC`.
- Toggle filter for completed/rejected requests.
- "Record new request" button → modal that calls `createDsr`.

### 8.2 `/admin/gdpr-requests/[id]` (detail)

Sections:
- **Subject**: identifier_phone / identifier_email; "Resolve diner" link → searches diners by phone/email across orgs; admin picks one or more matches; calls `resolveDinerForDsr`.
- **Request**: kind, source, body (verbatim), created_at.
- **Identity verification**: when not verified — modal with mandatory reason → `verifyDsrIdentity`. When verified — shows who/when/why.
- **Deadlines**: legal_deadline_at; "Extend deadline" modal (days + reason) → `extendDsrDeadline`.
- **Actions**: "Approve erasure" button — disabled until verified + status is 'received' + request_kind is 'erasure'. "Reject" modal with reason.
- **Cascade audit trail**: when `status = 'in_progress'` or `'completed'`, render rows from `erasure_log WHERE source_event_id = dsrId` plus the relevant `audit_logs` entries.
- **Failure surface**: when the most recent `AUDIT.compliance.erasure_failed` row exists for this DSR, show a red banner + "Retry cascade" button that re-enqueues the orchestrator job.

### 8.3 Empty-state + zero-data

If a Tavli admin opens `/admin/gdpr-requests` with no open requests, render an empty state explaining how requests typically arrive (email / phone / postal / verbal) and the legal 30-day deadline rule.

---

## 9. Confirmation email

### 9.1 Template

`src/emails/messages/{ro,en,de}/DataDeletionConfirmed.tsx` — React Email components wrapped by Wave 3's `EmailShell`. Three locale variants.

Subject: localised "Your data has been deleted" / "Datele tale au fost șterse" / "Ihre Daten wurden gelöscht".

Body (~4 short paragraphs):
1. Confirmation: "Per your request on `<createdAt>`, all your personal data has been deleted from Tavli's systems."
2. Reference id: "Reference: `<dsrId>`. Completed: `<completedAt>`."
3. What survives: "A small number of operational records (e.g., legally-required fiscal entries) are retained per Romanian law and EU regulation."
4. Contact: "Questions: legal@tavli.ro".

### 9.2 Send path

`sendTransactionalEmail({ to: identifierEmail, template: 'data_deletion_confirmed', locale: resolveDinerLocale(dinerId) ?? 'ro', params: { dsrId, completedAt, createdAt } })`. Routes through Wave 3's substrate (consent check is bypassed for transactional, suppression check is bypassed for compliance, idempotency via the existing 24h window).

### 9.3 Failure behaviour

Email send failure does NOT roll back the cascade. The `transactional_email_log` substrate logs the failure; the admin sees it in the cascade audit trail; manual re-send is a follow-up action.

---

## 10. pg-boss wiring

### 10.1 New job keys (in `src/lib/jobs/keys.ts`)

```ts
JOBS.compliance.erasureExecute                         // payload: { requestId: string }
JOBS.compliance.erasurePartnerNotificationsPhase2      // payload: { requestId: string }
JOBS.compliance.erasureVerify                          // payload: {}
```

### 10.2 Handlers + bootstrap registration

- `src/lib/jobs/handlers/compliance.ts` — three exported handler functions wrapping the work in §5 / §4.6 / §6.
- `src/lib/jobs/bootstrap.ts` — registers each via `boss.work()`, plus `boss.schedule(JOBS.compliance.erasureVerify, '0 3 * * *')` for the nightly sweep.
- Also registers the Wave-3-shipped `JOBS.diner.purgePseudonymised` handler (closes Wave 3's deferred follow-up).

---

## 11. TV error codes

| Code | Symbol | Where thrown |
|---|---|---|
| TV1100 | `dsr_not_found` | any action that loads a DSR by id |
| TV1101 | `dsr_wrong_status` | approveDsrErasure / rejectDsr / orchestrator entry-guard |
| TV1102 | `dsr_not_verified` | approveDsrErasure / orchestrator entry-guard |
| TV1103 | `dsr_diner_not_resolved` | (reserved; only emitted if a future hard-gate requires diner_id) |
| TV1105 | `erasure_cascade_failed` | orchestrator after 3 retries |
| TV1106 | `deadline_extension_exceeds_cap` | extendDsrDeadline |
| TV1107 | `deadline_extension_missing_reason` | extendDsrDeadline |

---

## 12. Testing

### 12.1 Unit tests (per-handler)

Each handler in `src/lib/compliance/handlers/<table>.ts` ships with `__tests__/<table>.test.ts` covering:
- Happy path: handler redacts the expected rows; writes the expected `erasure_log` rows; returns the expected `HandlerResult`.
- Idempotency: re-run on the same input → `rowsRedacted = 0`, no new `erasure_log` rows.
- Empty input: `dinerIds = []` → no-op.
- Pre-existing partial state: half-redacted rows already exist → only the remaining half is redacted.

### 12.2 Orchestrator tests

`src/lib/jobs/__tests__/handlers/compliance.test.ts`:
- Full cascade with mocked handlers in order; verifies cascade-summary aggregation.
- Wrong-status DSR → throws TV1101 without invoking any handler.
- Unverified DSR → throws TV1102.
- One handler throws → propagates; subsequent handlers do NOT run; DSR stays `in_progress`.
- Retry after partial failure → re-runs every handler; idempotent handlers no-op on already-done rows; DSR transitions to `completed`.
- Resolved diner identifiers captured BEFORE handlers run.

### 12.3 Verification sweep tests

`src/lib/compliance/__tests__/verify.test.ts`:
- Clean DB (all redacted rows are properly redacted) → `erasure_verification_passed` audit; no Sentry.
- One row with residual PII (e.g., `audit_logs.context->>'erased'` missing) → `erasure_verification_failed` audit + Sentry alert with sample id.
- Stub-only tables are skipped silently.

### 12.4 Server action tests

`src/lib/compliance/__tests__/dsr-actions.test.ts`:
- Permission denial per action.
- TV-code paths for each action.
- Happy paths with audit-log assertions.
- `extendDsrDeadline` boundary tests at 0 / 1 / 14 / 15 days.

### 12.5 Integration test

`src/lib/compliance/__tests__/erasure-cascade.integration.test.ts` (skipped in CI unless a `TEST_DATABASE_URL` is set; run locally):
1. Seed a diner with PII across every shipped registry table.
2. Create + verify + approve a DSR.
3. Run the orchestrator job synchronously (no pg-boss queue — direct handler call).
4. Run the partner_notifications phase 2 handler.
5. Assert: every PII column on every shipped table is null OR the JSONB `context` carries `{erased: true}`. The `erasure_log` table has rows for every redacted row. The DSR is `completed`. The diner has `anonymised_at` set. `JOBS.diner.purgePseudonymised` is queued with `startAfter` ≥ now + 29 days.

---

## 13. File layout

### New files

```
drizzle/migrations/0029_data_subject_requests.sql
drizzle/migrations/0030_audit_logs_redacted_at.sql
drizzle/migrations/0031_partner_notifications_pending_erasure_request_id.sql

src/lib/compliance/pii-table-registry.ts
src/lib/compliance/handlers/diners.ts
src/lib/compliance/handlers/marketing-consents.ts
src/lib/compliance/handlers/marketing-suppressions.ts
src/lib/compliance/handlers/partner-notifications-phase1.ts
src/lib/compliance/handlers/partner-notifications-phase2.ts
src/lib/compliance/handlers/audit-logs.ts
src/lib/compliance/handlers/__tests__/diners.test.ts
src/lib/compliance/handlers/__tests__/marketing-consents.test.ts
src/lib/compliance/handlers/__tests__/marketing-suppressions.test.ts
src/lib/compliance/handlers/__tests__/partner-notifications-phase1.test.ts
src/lib/compliance/handlers/__tests__/partner-notifications-phase2.test.ts
src/lib/compliance/handlers/__tests__/audit-logs.test.ts
src/lib/compliance/dsr-actions.ts
src/lib/compliance/__tests__/dsr-actions.test.ts
src/lib/compliance/verify.ts
src/lib/compliance/__tests__/verify.test.ts
src/lib/compliance/__tests__/erasure-cascade.integration.test.ts

src/lib/jobs/handlers/compliance.ts
src/lib/jobs/__tests__/handlers/compliance.test.ts

src/emails/messages/ro/DataDeletionConfirmed.tsx
src/emails/messages/en/DataDeletionConfirmed.tsx
src/emails/messages/de/DataDeletionConfirmed.tsx

src/app/admin/gdpr-requests/page.tsx
src/app/admin/gdpr-requests/[id]/page.tsx
src/app/admin/gdpr-requests/[id]/actions.ts
src/app/admin/gdpr-requests/[id]/components/{ResolveDinerModal,VerifyIdentityModal,ApproveErasureButton,RejectModal,ExtendDeadlineModal,CascadeAuditTrail,FailureBanner}.tsx
```

### Modified files

```
src/lib/db/schema.ts                        # add data_subject_requests table + audit_logs.redacted_at column + partner_notifications.pending_erasure_request_id column
src/lib/jobs/keys.ts                        # add JOBS.compliance.{erasureExecute, erasurePartnerNotificationsPhase2, erasureVerify}
src/lib/jobs/bootstrap.ts                   # register compliance handlers + schedule verification sweep + register JOBS.diner.purgePseudonymised
src/lib/audit/actions.ts                    # add AUDIT.compliance.* registry entries
src/lib/permissions/                        # add can:gdpr.* permissions; exact file determined by current permissions module layout (verified during plan-writing)
```

---

## 14. Implementation phasing (for the plan)

1. **Migrations + schema** — 0029 + 0030 + 0031 + schema.ts + drizzle bookkeeping. One commit for the SQL (all three migrations), one for schema.ts updates.
2. **Registry + handlers + handler tests** — pii-table-registry.ts + the six handler files + their unit tests. Single phase but ~6 commits one-per-handler.
3. **Email template** — three locale variants of DataDeletionConfirmed + minor wiring tests.
4. **Orchestrator + verification sweep** — handlers/compliance.ts + verify.ts + their tests + pg-boss key + bootstrap registration. One commit for the orchestrator + tests; one for the verification sweep + tests.
5. **Server actions + permissions + AUDIT entries** — dsr-actions.ts + permissions + AUDIT.compliance.* + tests. Single commit for actions + tests; permission and AUDIT changes can ride with the actions commit since they're trivial.
6. **Admin UI** — list page, detail page, modals, server-action wiring. Two commits: list view, then detail view.
7. **Integration test + manual prod migration application + bookkeeping insert** — final commit; documentation update on `build-order.md` to check off the unit.

Total commits target: ~15. Each migration-bearing phase uses the 2-commit pattern per Wave 3 convention.

---

## 15. Open risks + future-work flags

1. **`audit_logs.context` from pre-this-unit domain code may contain raw PII strings** — the audit_logs handler replaces the WHOLE context payload to handle this safely. Future Waves should refactor domain audit-writes to insert only FK ids (`{diner_id, reservation_id}`) so a later erasure trivially nulls the FK target via the cascade. Spec language for the refactor lives in §13 §6.3 step (i).
2. **`partner_notifications.payload` likely contains denormalised PII** — phase 2 handles this via wholesale replacement (legacy fallback). Future §04 refactor: replace inline PII with FK refs. Spec language in §13 §6.3 step (h).
3. **Pre-this-unit code that inserts PII into `audit_logs.context`** — discoverable via grep on `recordAudit` callsites; tracked separately as a tech-debt entry.
4. **`audit_logs` rows with `subject_type` outside {`diner`, `reservation`} may carry diner PII in `context`** — v1 only handles those two subject_types (most common diner-PII surface). Other subject_types (`review`, `partner_notification`, `data_subject_request`, etc.) that legacy code may have stamped with diner-name strings are NOT scrubbed by this unit. Mitigation: the §13 §6.3 step (i) refactor (FK-id-only context payloads) closes this gap structurally. Until then: a one-off audit query during plan-writing can quantify the residual surface; if non-trivial, an additional pass can be added.
5. **Schema-coverage CI guard** — out of scope for this unit, but a future linter could scan `schema.ts` for columns matching `phone|email|first_name|last_name|notes` and assert their tables appear in the registry. Tracked as a follow-up.
6. **`partner_notifications.payload` join-path drift** — the phase 1 handler's UNION of well-known JOIN paths must be extended whenever §04 ships a new `kind` whose payload references a diner. Without a CI guard, a new kind that misses the registry is a silent gap. Mitigation: the verification sweep would NOT catch it (because the row never gets `pending_erasure_at` set). A future linter could assert every `kind` constant in `src/lib/notifications/kinds.ts` (or wherever the canonical kind enum lives) has an entry in the join-path registry. Tracked.
7. **`partner_notifications.kind` hard-delete-eligibility registry drift** — same shape of risk: phase 2's "hard-delete-eligible kinds" set must grow with §04. Tracked alongside (6).
8. **DSR-on-staff-user-erasure** — a venue owner asking to erase their staff account is not handled by this unit. Documented out-of-scope.
9. **Cookie-consent record cascade** — when the §13 cookie consent table ships (sibling Wave 4 unit), it joins the registry. Recorded as a stub-pending row above.
10. **Stripe customer data** — out of scope here; handled by Wave 5 `billing_audit_log` handler + a separate Stripe-side data-erasure API call.

---

## 16. Acceptance criteria

- Migrations 0029 + 0030 + 0031 applied to prod; drizzle bookkeeping rows inserted.
- `PII_TABLE_REGISTRY` exported + lists every v1 PII table (shipped or stubbed) with the correct `coveredBy` / `shipped` flags.
- All six handler unit-test files green; orchestrator unit-test file green; verification-sweep unit-test file green; dsr-actions test file green.
- Integration test (`erasure-cascade.integration.test.ts`) passes locally against a real postgres.
- `JOBS.compliance.erasureExecute` registered at worker bootstrap; `JOBS.compliance.erasureVerify` scheduled nightly at 03:00 UTC; `JOBS.diner.purgePseudonymised` (Wave 3 helper) also registered.
- `/admin/gdpr-requests` list + detail render for a tavli_admin user; full happy-path (create → resolve → verify → approve → cascade completes → email sent → DSR marked completed) verifiable in dev.
- `npx tsc --noEmit` clean; `npm run lint` no new errors or warnings beyond Wave 3 baseline.
- `build-order.md` line 103 checked off with shipped-date annotation matching Wave 3 convention.
