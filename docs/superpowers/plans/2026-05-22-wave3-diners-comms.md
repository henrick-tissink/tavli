# Wave 3 — Diner CRM + Comms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all 8 Wave 3 build-order units (§03 Diner CRM + §04 Comms upgrade) in one push, including the 3 foundation tables Wave 1 missed (erasure_log, marketing_consents, marketing_suppressions).

**Architecture:** Six sub-units (A–F), ~18 commits, 8 migrations (0021–0028). Sub-unit C (foundations backfill) ships before D (which needs erasure_log) and E (which needs marketing_consents + marketing_suppressions). Sub-unit E ships transactional_email_log before D's pseudonymiseDiner cascade. All on main per Tavli convention.

**Tech Stack:** Next.js 15 App Router · TypeScript · Drizzle ORM · Postgres (Supabase) · pg-boss (job queue) · @react-email/render · resend · twilio · libphonenumber-js · Jest.

**Spec:** `docs/superpowers/specs/2026-05-22-wave3-diners-comms-design.md`.

---

## File structure overview

### Sub-unit A (4 commits)
| File | Action |
|---|---|
| `drizzle/migrations/0021_diners_table.sql` | Create |
| `drizzle/migrations/0022_diner_fk_columns.sql` | Create |
| `src/lib/db/schema.ts` | Modify (add `diners`, `dinerAcquisitionSource`, FK columns on reservations + reviews) |
| `src/lib/diners/upsert.ts` | Create |
| `src/lib/diners/profile.ts` | Create |
| `src/lib/diners/search.ts` | Create |
| `src/lib/diners/mask.ts` | Create |
| `src/lib/diners/__tests__/*` | Create |
| `src/app/api/reservations/actions.ts` | Modify (call findOrCreateDinerForReservation) |

### Sub-unit B (1 commit)
| File | Action |
|---|---|
| `drizzle/migrations/0023_diner_pii_access_log.sql` | Create |
| `src/lib/db/schema.ts` | Modify |
| `src/lib/diners/reveal-pii-batch.ts` + tests | Create |

### Sub-unit C (2 commits)
| File | Action |
|---|---|
| `drizzle/migrations/0024_erasure_log.sql` | Create |
| `drizzle/migrations/0025_marketing_consents_suppressions.sql` | Create |
| `src/lib/db/schema.ts` | Modify |

### Sub-unit D (3 commits)
| File | Action |
|---|---|
| `src/app/partner/(dashboard)/diners/actions.ts` (mergeDiners + splitDiner) | Create |
| `src/lib/diners/pseudonymise.ts` + tests | Create |
| `src/lib/jobs/diners.ts` (3 jobs) | Create |
| `src/lib/jobs/registry.ts` | Modify (add 3 keys) |
| `src/app/partner/(dashboard)/reservations/actions.ts` | Modify (enqueue aggregate recompute) |

### Sub-unit E (3 commits)
| File | Action |
|---|---|
| `drizzle/migrations/0026_transactional_email_log.sql` | Create |
| `src/lib/db/schema.ts` | Modify |
| `src/lib/email/send-transactional.ts` + tests | Create |
| `src/lib/email/resolve-locale.ts` + tests | Create |
| `src/lib/email/render-template.ts` | Create |
| `src/emails/_shell/EmailShell.tsx` | Create |
| `src/emails/messages/{ro,en,de}/*.json` | Create |
| Existing email callsites (`src/app/api/reservations/actions.ts`, etc.) | Modify (use sendTransactionalEmail) |
| `src/app/api/webhooks/resend/route.ts` + tests | Create |

### Sub-unit F (4 commits)
| File | Action |
|---|---|
| `drizzle/migrations/0027_restaurant_transactional_sms.sql` | Create |
| `drizzle/migrations/0028_partner_notifications_pending_erasure.sql` | Create |
| `src/lib/db/schema.ts` | Modify |
| `src/lib/sms/send-transactional.ts` + tests | Create |
| `src/lib/sms/render-template.ts` | Create |
| `src/emails/messages/{ro,en,de}/sms/*.json` | Create |
| `src/app/api/webhooks/twilio-sms-status/route.ts` + tests | Create |

---

## Section 1 — Sub-unit A: §03 Diner core

### Task A1: Migration 0021 — `diners` table + enum + RLS + indices

**Files:**
- Create: `drizzle/migrations/0021_diners_table.sql`
- Create: `drizzle/migrations/meta/0021_snapshot.json` (auto-generated)
- Modify: `drizzle/migrations/meta/_journal.json`
- Modify: `src/lib/db/schema.ts` (append `dinerAcquisitionSource` enum + `diners` table)

- [ ] **Step 1: Write the SQL** — copy verbatim from the spec doc §Sub-unit A, Migration 0021. Comments at the top reference `§01 §3.7 RLS pattern` and the architecture doc section.

- [ ] **Step 2: Write the Drizzle mirror** — append to `src/lib/db/schema.ts`:

```ts
export const dinerAcquisitionSource = pgEnum("diner_acquisition_source", [
  "widget", "venue_page", "editorial", "corporate",
  "walk_in", "manual", "import", "email_campaign", "api",
] as const);

export const diners = pgTable("diners", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  phone: varchar("phone", { length: 20 }),
  phoneRaw: varchar("phone_raw", { length: 40 }),
  email: varchar("email", { length: 255 }),
  fullName: varchar("full_name", { length: 200 }),
  locale: char("locale", { length: 2 }).notNull().default("ro"),
  allergies: text("allergies").array().notNull().default(sql`'{}'::text[]`),
  occasionTags: text("occasion_tags").array().notNull().default(sql`'{}'::text[]`),
  seatingPreferences: jsonb("seating_preferences").notNull().default(sql`'{}'::jsonb`),
  dietaryPreferences: text("dietary_preferences").array().notNull().default(sql`'{}'::text[]`),
  birthdayDate: date("birthday_date"),
  anniversaryDate: date("anniversary_date"),
  internalNotes: text("internal_notes"),
  acquisitionSource: dinerAcquisitionSource("acquisition_source"),
  acquisitionRestaurantId: uuid("acquisition_restaurant_id")
    .references(() => restaurants.id, { onDelete: "set null" }),
  visitCount: integer("visit_count").notNull().default(0),
  coversTotal: integer("covers_total").notNull().default(0),
  firstVisitedAt: timestamp("first_visited_at", { withTimezone: true }),
  lastVisitedAt: timestamp("last_visited_at", { withTimezone: true }),
  frequencyBucket: varchar("frequency_bucket", { length: 20 }).notNull().default("first_timer"),
  typicalPartySizeMin: integer("typical_party_size_min"),
  typicalPartySizeMax: integer("typical_party_size_max"),
  noShowCount: integer("no_show_count").notNull().default(0),
  cancellationCount: integer("cancellation_count").notNull().default(0),
  redactedAt: timestamp("redacted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  phoneUnique: uniqueIndex("diners_org_phone_unique")
    .on(t.organizationId, t.phone)
    .where(sql`${t.phone} IS NOT NULL AND ${t.redactedAt} IS NULL`),
  emailUnique: uniqueIndex("diners_org_email_unique")
    .on(t.organizationId, sql`lower(${t.email})`)
    .where(sql`${t.email} IS NOT NULL AND ${t.phone} IS NULL AND ${t.redactedAt} IS NULL`),
  fullNameIdx: index("diners_org_full_name").on(t.organizationId, sql`lower(${t.fullName})`),
  phoneIdx: index("diners_org_phone").on(t.organizationId, t.phone),
  frequencyIdx: index("diners_frequency")
    .on(t.organizationId, t.frequencyBucket)
    .where(sql`${t.redactedAt} IS NULL`),
  lastVisitedIdx: index("diners_last_visited")
    .on(t.organizationId, sql`${t.lastVisitedAt} DESC`)
    .where(sql`${t.redactedAt} IS NULL`),
  identityRequiredCheck: check("diners_identity_required", sql`${t.phone} IS NOT NULL OR ${t.email} IS NOT NULL`),
}));
```

- [ ] **Step 3: Run db:generate** — confirm snapshot generates cleanly; delete any phantom `.sql`; restore journal tag to `0021_diners_table`.

- [ ] **Step 4: Apply locally**

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/migrations/0021_diners_table.sql
HASH=$(shasum -a 256 drizzle/migrations/0021_diners_table.sql | cut -d' ' -f1)
psql "$DATABASE_URL" -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('$HASH', $(($(date +%s) * 1000)));"
```

If local Postgres isn't running, skip and report.

- [ ] **Step 5: tsc clean**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add drizzle/migrations/0021_diners_table.sql \
        drizzle/migrations/meta/0021_snapshot.json \
        drizzle/migrations/meta/_journal.json \
        src/lib/db/schema.ts
git commit -m "feat(diners): migration 0021 — diners table + enum + RLS + indices (§03 §4.1 Wave 3 sub-unit A)"
```

---

### Task A2: Migration 0022 — `reservations.diner_id` + `reviews.diner_id`

**Files:**
- Create: `drizzle/migrations/0022_diner_fk_columns.sql`
- Modify: `src/lib/db/schema.ts` (add `dinerId` columns + indices)

- [ ] **Step 1: SQL** — verbatim from spec §A.2.

- [ ] **Step 2: Drizzle mirror** — add `dinerId: uuid("diner_id").references(() => diners.id, { onDelete: "set null" })` to `reservations` and `reviews` table definitions. Add the two indices.

- [ ] **Step 3: db:generate, apply locally, tsc**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(diners): migration 0022 — diner_id FK on reservations + reviews (§03 §4.2/§4.3 Wave 3 sub-unit A)"
```

---

### Task A3: `findOrCreateDinerForReservation` + integration

**Files:**
- Create: `src/lib/diners/upsert.ts`
- Create: `src/lib/diners/__tests__/upsert.test.ts`
- Modify: `src/app/api/reservations/actions.ts` (call upsert after reservation insert)

- [ ] **Step 1: Write failing tests** for `makeFindOrCreateDinerForReservation`:
  - Phone path: existing diner found → returns isNew=false + soft-updates email/name
  - Phone path: no match → INSERT new + returns isNew=true
  - Email-only path: existing → isNew=false
  - Email-only path: no match → INSERT new
  - No phone, no email → throws
  - Cross-org isolation: same phone in two orgs returns two distinct diner_ids
  - Returns `{ dinerId, isNew }` shape

- [ ] **Step 2: Implementation** — copy verbatim from spec §A.3. The DI seam takes `db` (the Drizzle service-role client).

- [ ] **Step 3: Integration into `createReservation`** — after the reservation INSERT but before the audit row, call `findOrCreateDinerForReservation` with the restaurant's org_id (resolved via `restaurants.organization_id` from Wave 2). Then UPDATE the reservation with `diner_id`.

```ts
// In createReservation, after reservation INSERT succeeds:
const restaurantOrgRow = await adminClient
  .from("restaurants")
  .select("organization_id")
  .eq("id", input.restaurantId)
  .maybeSingle();

if (restaurantOrgRow.data?.organization_id) {
  const { dinerId } = await findOrCreateDinerForReservation({
    organizationId: restaurantOrgRow.data.organization_id,
    restaurantId: input.restaurantId,
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    guestEmail: input.guestEmail,
    acquisitionSource: "widget",
  });
  await adminClient.from("reservations").update({ diner_id: dinerId }).eq("id", reservationId);
}
```

- [ ] **Step 4: Update existing reservation tests** to mock `findOrCreateDinerForReservation` or accept the new column.

- [ ] **Step 5: tsc + tests**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(diners): findOrCreateDinerForReservation + integrate into createReservation (§03 §5.2 Wave 3 sub-unit A)"
```

---

### Task A4: `getDinerProfile` + `searchDiners` + `maskPhone`/`maskEmail`

**Files:**
- Create: `src/lib/diners/profile.ts`, `src/lib/diners/search.ts`, `src/lib/diners/mask.ts`
- Create: respective `__tests__/` files

- [ ] **Step 1: `mask.ts`** — pure functions. Tests cover RO phone, intl phone, short email, long email, edge cases (empty string, null).

```ts
export function maskPhone(e164: string): string {
  if (!e164 || e164.length < 6) return e164;
  // +40712345689 → +40 7•• ••• •89 (RO format)
  // generic fallback: keep country code + last 2 digits, mask middle
  const cc = e164.slice(0, 3);
  const last = e164.slice(-2);
  return `${cc} •• ••• •${last}`;
}

export function maskEmail(addr: string): string {
  const [local, domain] = addr.split("@");
  if (!local || !domain) return addr;
  if (local.length <= 2) return `${local[0]}•@${domain}`;
  return `${local[0]}•••${local.slice(-1)}@${domain}`;
}
```

- [ ] **Step 2: `profile.ts`** — `getDinerProfile(dinerId, scope)`:
  - Returns the diner row + a visit-history sub-query joining `reservations` filtered to restaurants the caller can read.
  - For Wave 3 this is the data-layer helper; the page consuming it is deferred to Wave 4 (or a Wave-3 polish commit).

- [ ] **Step 3: `search.ts`** — `searchDiners({ orgId, query, limit?, offset? })`:
  - Plain `ILIKE` on `full_name`, `phone`, `email`.
  - Optional phone normalisation when the query starts with `+` or 4+ digits.
  - Returns masked phone/email per the mask helpers.

- [ ] **Step 4: tsc + tests**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(diners): getDinerProfile + searchDiners + mask helpers (§03 §5.1/§5.4 Wave 3 sub-unit A)"
```

---

## Section 2 — Sub-unit B: §03 PII access log

### Task B1: Migration 0023 + `revealPiiBatch` helper

**Files:**
- Create: `drizzle/migrations/0023_diner_pii_access_log.sql`
- Modify: `src/lib/db/schema.ts` (add `dinerPiiAccessLog`)
- Create: `src/lib/diners/reveal-pii-batch.ts` + tests

- [ ] **Step 1: SQL** — verbatim from spec §B.

- [ ] **Step 2: Drizzle mirror**

```ts
export const dinerPiiAccessLog = pgTable("diner_pii_access_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  dinerId: uuid("diner_id").notNull().references(() => diners.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  accessedByUserId: uuid("accessed_by_user_id").notNull().references(() => authUsers.id),
  accessedField: varchar("accessed_field", { length: 40 }).notNull(),
  accessKind: varchar("access_kind", { length: 20 }).notNull(),
  surface: varchar("surface", { length: 40 }),
  contextReservationId: uuid("context_reservation_id").references(() => reservations.id, { onDelete: "set null" }),
  accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  dinerIdx: index("diner_pii_access_log_diner").on(t.dinerId, sql`${t.accessedAt} DESC`),
  actorIdx: index("diner_pii_access_log_actor").on(t.accessedByUserId, sql`${t.accessedAt} DESC`),
}));
```

- [ ] **Step 3: db:generate, apply locally**

- [ ] **Step 4: `revealPiiBatch` implementation** — verbatim from spec §B.2.

- [ ] **Step 5: Tests**:
  - Empty dinerIds list → loader called with []; no log rows inserted
  - Single dinerId → 1 log row + loader invoked with that id
  - Multiple dinerIds → batched single INSERT with N rows + loader invoked with all
  - Log row shape: contextReservationId optional, accessKind enum-valid, accessedField + surface present
  - Loader called AFTER insert (test by capturing call order)

- [ ] **Step 6: tsc + tests + commit**

```bash
git commit -m "feat(diners): diner_pii_access_log + revealPiiBatch helper (§03 §5.5/§8.1 Wave 3 sub-unit B)"
```

---

## Section 3 — Sub-unit C: Foundations backfill

### Task C1: Migration 0024 — `erasure_log`

**Files:**
- Create: `drizzle/migrations/0024_erasure_log.sql`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: SQL** — verbatim from spec §C.

- [ ] **Step 2: Drizzle mirror**

```ts
export const erasureLog = pgTable("erasure_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  subjectType: varchar("subject_type", { length: 40 }).notNull(),
  subjectId: uuid("subject_id").notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  reason: varchar("reason", { length: 80 }).notNull(),
  redactedColumns: text("redacted_columns").array().notNull().default(sql`'{}'::text[]`),
  actorUserId: uuid("actor_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  impersonatorUserId: uuid("impersonator_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  context: jsonb("context").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  subjectIdx: index("erasure_log_subject").on(t.subjectType, t.subjectId),
  actorIdx: index("erasure_log_actor").on(t.actorUserId, sql`${t.createdAt} DESC`),
  createdIdx: index("erasure_log_created").on(sql`${t.createdAt} DESC`),
}));
```

- [ ] **Step 3: db:generate, apply, tsc, commit**

```bash
git commit -m "feat(foundations): erasure_log table + RLS (foundations §15a.1 — Wave 3 sub-unit C backfill)"
```

---

### Task C2: Migration 0025 — `marketing_consents` + `marketing_suppressions`

**Files:**
- Create: `drizzle/migrations/0025_marketing_consents_suppressions.sql`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: SQL** — verbatim from spec §C.

- [ ] **Step 2: Drizzle mirrors** for both tables. Cross-FK between `marketing_consents.diner_id` and `diners.id` (`ON DELETE CASCADE` per the SQL — so deleted diners cascade-delete their consents).

- [ ] **Step 3: db:generate, apply, tsc, commit**

```bash
git commit -m "feat(foundations): marketing_consents + marketing_suppressions tables (foundations §4.7 — Wave 3 sub-unit C backfill)"
```

---

## Section 4 — Sub-unit D: §03 mutations + pseudonymise + jobs

### Task D1: `mergeDiners` server action

**Files:**
- Create: `src/app/partner/(dashboard)/diners/actions.ts` (mergeDiners + later splitDiner)
- Create: `src/app/partner/(dashboard)/diners/__tests__/actions.test.ts`

- [ ] **Step 1: Tests** (failing):
  - Cross-org rejection → returns `{ ok: false, error: ... }`, no DB writes, no audit
  - Diner not found → returns error
  - Permission denied (caller not org admin/owner) → returns error
  - Happy path: target diner gets union'd allergies + jsonb merged + longer notes + target identity unchanged; source diner deleted; reservations + reviews repointed; audit row written with both source + target ids
  - Audit threads currentActor (impersonator)

- [ ] **Step 2: Implementation** — adapt from spec §D.1.

- [ ] **Step 3: tsc + tests + commit**

```bash
git commit -m "feat(diners): mergeDiners server action with audit + currentActor threading (§03 §5.3 Wave 3 sub-unit D)"
```

---

### Task D2: `splitDiner` server action

**Files:**
- Modify: `src/app/partner/(dashboard)/diners/actions.ts` (append `splitDinerAction`)
- Modify: `src/app/partner/(dashboard)/diners/__tests__/actions.test.ts`

- [ ] **Step 1: Tests**:
  - Identity-collision rejection (would violate partial unique on `(org, phone)`)
  - Reservation not owned by source diner → reject
  - Identity not provided (no phone, no email) → reject
  - Happy path: new diner inserted; reservations + reviews moved; audit written
  - Cross-org rejection (reservations belong to a different org than source diner) → reject

- [ ] **Step 2: Implementation** — single transaction: INSERT new diner with explicit identity, UPDATE reservations + reviews where `id IN (input.reservationIds) AND diner_id = sourceId`.

- [ ] **Step 3: tsc + tests + commit**

```bash
git commit -m "feat(diners): splitDiner server action (§03 §5.3 Wave 3 sub-unit D)"
```

---

### Task D3: `pseudonymiseDiner` + pg-boss jobs

**Files:**
- Create: `src/lib/diners/pseudonymise.ts` + tests
- Create: `src/lib/jobs/diners.ts`
- Modify: `src/lib/jobs/registry.ts` — add 3 keys
- Modify: `src/app/partner/(dashboard)/reservations/actions.ts` — enqueue `diner.recompute-aggregates` on status changes

**Note:** depends on `transactional_email_log` existing — defer this task until AFTER sub-unit E ships migration 0026. The plan re-orders execution: D1 → D2 → E1 → E2 → E3 → D3 → F.

- [ ] **Step 1: Tests for `pseudonymiseDiner`**:
  - Diner PII columns nulled + `redacted_at` set
  - `reservations.guest_*` nulled for all of diner's reservations
  - `reviews.first_name` nulled
  - `transactional_email_log` rows for diner: `email`/`phone` nulled + `redacted_at` set
  - `erasure_log` row written with correct shape
  - Two audit rows written (`AUDIT.diner.pseudonymised` + `AUDIT.compliance.erasure_executed`)
  - Impersonator threading via currentActor

- [ ] **Step 2: Implementation** — verbatim from spec §D.3.

- [ ] **Step 3: pg-boss jobs**:
  - `diner.recompute-aggregates` — handler signature `(payload: { dinerId: string }) => Promise<void>`. Loads diner's reservations, recomputes the aggregate columns, UPDATEs.
  - `diner.frequency-bucket-rebalance` — cron handler; iterates all non-redacted diners, recomputes frequency bucket based on `last_visited_at` + `visit_count`.
  - `diner.purge-pseudonymised` — cron handler; DELETEs diners where `redacted_at < now() - interval '30 days'`. Audit row written per delete (`AUDIT.diner.deleted`).

- [ ] **Step 4: Registry additions** — add the 3 keys to `src/lib/jobs/registry.ts` with their schedules + handlers.

- [ ] **Step 5: Enqueue from reservation actions** — in `src/app/partner/(dashboard)/reservations/actions.ts`, after any reservation status change that touches a diner-linked reservation, enqueue `diner.recompute-aggregates` with `{ dinerId }`.

- [ ] **Step 6: tsc + tests + commit**

```bash
git commit -m "feat(diners): pseudonymiseDiner + aggregate/frequency/purge jobs (§03 §5.1/§7/§8.2 Wave 3 sub-unit D)"
```

---

## Section 5 — Sub-unit E: §04 transactional email

### Task E1: Migration 0026 — `transactional_email_log`

**Files:**
- Create: `drizzle/migrations/0026_transactional_email_log.sql`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: SQL** — verbatim from spec §E.1.

- [ ] **Step 2: Drizzle mirror** — full table mirror including CHECK constraints (Drizzle's `check()` syntax).

- [ ] **Step 3: db:generate, apply, tsc, commit**

```bash
git commit -m "feat(comms): migration 0026 — transactional_email_log unified table (§04 §5.1 Wave 3 sub-unit E)"
```

---

### Task E2: `sendTransactionalEmail` + `resolveDinerLocale` + `EmailShell` + i18n catalogues

**Files:**
- Create: `src/lib/email/send-transactional.ts` + tests
- Create: `src/lib/email/resolve-locale.ts` + tests
- Create: `src/lib/email/render-template.ts`
- Create: `src/emails/_shell/EmailShell.tsx`
- Create: `src/emails/messages/{ro,en,de}/<template>.json` for each of: reservation_confirmation, reservation_reminder_24h, reservation_cancelled, reservation_modified, review_request, partner_booking_alert, staff_invitation, password_reset, email_verification, data_export_ready (10 RO files filled; 10 EN + 10 DE files as fallback stubs that re-export RO)
- Create: `src/emails/messages/loader.ts` (locale-resolver helper)
- Modify: existing email send-sites in `src/app/api/reservations/actions.ts` + `src/app/api/event-requests/actions.ts` + `/sign-in` flows — replace `sendEmail` calls with `sendTransactionalEmail`. Identify each callsite via grep; refactor incrementally.

- [ ] **Step 1: Tests for `resolveDinerLocale`** — priority order: diner > reservation > restaurant > default 'ro'.

- [ ] **Step 2: Tests for `sendTransactionalEmail`**:
  - Queued → sent transition with successful Resend
  - Queued → failed transition on Resend error (with failure_reason captured)
  - `EMAIL_DEV_FORCED_RECIPIENT` override honored
  - `organization_id_at_event` resolved from context.organization_id; falls back to PLATFORM_ORG_ID; throws when neither
  - Log row shape (channel='email', subject, template_key, locale, status)

- [ ] **Step 3: EmailShell tests** — renders header/footer when restaurant data present; degrades gracefully when legal_name/tax_id/etc. are null.

- [ ] **Step 4: Implementations** — adapt from spec §E.2, §E.3.

- [ ] **Step 5: Locale loader** — `loader.ts` exports `loadMessages(locale, template)`. Reads `messages/<locale>/<template>.json`; if file missing or empty, falls back to RO.

- [ ] **Step 6: i18n catalogue files** — RO files filled with reasonable copy (placeholders OK for fields like restaurant_name, date, time, party_size — these are template variables, not copy). EN + DE files: empty object `{}` so the loader falls back to RO.

- [ ] **Step 7: Refactor existing email callsites** — grep for `sendEmail(` to find them; replace with `sendTransactionalEmail` calls with appropriate template + context.

- [ ] **Step 8: tsc + tests + commit**

```bash
git commit -m "feat(comms): sendTransactionalEmail + locale resolver + EmailShell + i18n catalogues + refactor existing callsites (§04 §3-§6 Wave 3 sub-unit E)"
```

---

### Task E3: Resend webhook

**Files:**
- Create: `src/app/api/webhooks/resend/route.ts` + tests

- [ ] **Step 1: Tests**:
  - Missing svix headers → 401
  - Invalid signature → 401
  - Idempotent replay (same `provider_event_id`) → 200 + handle() not invoked second time
  - email.delivered → updates log row's email_status to 'delivered'
  - email.bounced → updates log row + inserts marketing_suppressions row with channel='email' + source='bounce'
  - email.complained → updates log row + inserts marketing_suppressions row with source='complaint'

- [ ] **Step 2: Implementation** — adapt from spec §E.4 (Svix-style signature verify).

- [ ] **Step 3: tsc + tests + commit**

```bash
git commit -m "feat(comms): Resend webhook routed through ingestWebhook + marketing_suppressions on bounce/complaint (§04 §5.2 Wave 3 sub-unit E)"
```

---

## Section 6 — Sub-unit F: §04 SMS + Twilio + leaf column

### Task F1: Migration 0027 — `restaurants.transactional_sms_enabled`

**Files:**
- Create: `drizzle/migrations/0027_restaurant_transactional_sms.sql`
- Modify: `src/lib/db/schema.ts` (add column to restaurants mirror)

- [ ] **Step 1: SQL** — verbatim from spec §F.1.

- [ ] **Step 2: Drizzle mirror** — `transactionalSmsEnabled: boolean("transactional_sms_enabled").notNull().default(false)` on `restaurants`.

- [ ] **Step 3: db:generate, apply, tsc, commit**

```bash
git commit -m "feat(comms): restaurants.transactional_sms_enabled column (§04 §6.2 Wave 3 sub-unit F)"
```

---

### Task F2: `sendTransactionalSms` wrapper

**Files:**
- Create: `src/lib/sms/send-transactional.ts` + tests
- Create: `src/lib/sms/render-template.ts`
- Create: `src/emails/messages/{ro,en,de}/sms/{reservation_confirmation_sms,reservation_reminder_24h_sms,reservation_cancelled_sms}.json`

- [ ] **Step 1: Tests** for `sendTransactionalSms`:
  - E.164 validation fails → returns error TV200
  - Restaurant SMS gate off → returns TV201
  - Consent missing → returns TV202 (when dinerId provided)
  - Anonymous booking (no dinerId) → skips consent check, sends
  - In suppression list → returns TV203
  - Idempotency: prior sent row in last 24h → returns short-circuit OK with prior messageSid
  - Twilio send failure → log row updated to 'failed' with failure_reason
  - Happy path: log row inserted as 'queued', Twilio call, log updated to 'sent' with twilio_message_sid

- [ ] **Step 2: Implementation** — adapt from spec §F.2.

- [ ] **Step 3: i18n catalogue files** — 3 SMS templates × 3 locales = 9 files. RO filled with template copy.

- [ ] **Step 4: tsc + tests + commit**

```bash
git commit -m "feat(comms): sendTransactionalSms wrapper with consent/gate/suppression/idempotency checks (§04 §6.2 Wave 3 sub-unit F)"
```

---

### Task F3: Twilio status webhook

**Files:**
- Create: `src/app/api/webhooks/twilio-sms-status/route.ts` + tests

- [ ] **Step 1: Tests**:
  - Missing/invalid signature → 401
  - Idempotency via `ingestWebhook`
  - MessageStatus=sent → update log row sms_status='sent'
  - MessageStatus=delivered → update log row sms_status='delivered'
  - MessageStatus=undelivered → update log row sms_status='undelivered' + failure_reason from ErrorMessage
  - MessageStatus=failed → update log row sms_status='failed' + failure_reason

- [ ] **Step 2: Implementation** — Twilio signature verification per `twilio.validateRequest(authToken, url, params)`. Updates `transactional_email_log` by `twilio_message_sid`.

- [ ] **Step 3: tsc + tests + commit**

```bash
git commit -m "feat(comms): Twilio SMS status webhook routed through ingestWebhook (§04 §5.3 Wave 3 sub-unit F)"
```

---

### Task F4: Migration 0028 — `partner_notifications.pending_erasure` columns

**Files:**
- Create: `drizzle/migrations/0028_partner_notifications_pending_erasure.sql`
- Modify: `src/lib/db/schema.ts` (add columns to partnerNotifications mirror)

- [ ] **Step 1: SQL** — verbatim from spec §F.4.

- [ ] **Step 2: Drizzle mirror** — `pendingErasureAt: timestamp("pending_erasure_at", { withTimezone: true })` + `redactedAt: timestamp("redacted_at", { withTimezone: true })` on partnerNotifications.

- [ ] **Step 3: db:generate, apply, tsc, commit**

```bash
git commit -m "feat(comms): partner_notifications.pending_erasure_at + redacted_at columns (build-order §13 leaf cascade — Wave 3 sub-unit F)"
```

---

## Section 7 — Build-order annotation + push

### Task G1: Annotate build-order + push

**Files:**
- Modify: `docs/superpowers/architecture/build-order.md` (mark §03 + §04 units `[x]`)

- [ ] **Step 1: Mark 4 §03 lines + 4 §04 lines `[x]`** with shipped-2026-05-22 annotations referencing the commits.

- [ ] **Step 2: Commit + push everything**

```bash
git add docs/superpowers/architecture/build-order.md
git commit -m "docs(build-order): annotate Wave 3 §03 + §04 shipped (closes 8 units)"
git push origin main
```

- [ ] **Step 3: Apply all migrations to prod** (0021–0028) via psql + drizzle bookkeeping.

- [ ] **Step 4: Update memory** — bump `project_v1_build_phase.md` to reflect Wave 3 closed.

- [ ] **Step 5: Final reviewer dispatch** — full-implementation review per the subagent-driven-development skill.

---

## Self-Review

**Spec coverage check:**

| Spec section | Tasks |
|---|---|
| §03 §4.1 diners table | A1 |
| §03 §4.2 reservations.diner_id | A2 |
| §03 §4.3 reviews.diner_id | A2 |
| §03 §5.2 findOrCreateDinerForReservation | A3 |
| §03 §5.1 getDinerProfile | A4 |
| §03 §5.4 searchDiners | A4 |
| §03 §5.5 revealPiiBatch | B1 |
| §03 §8.1 diner_pii_access_log | B1 |
| §03 §5.3 mergeDiners | D1 |
| §03 §5.3 splitDiner | D2 |
| §03 §5.1/§8.2 pseudonymiseDiner | D3 |
| §03 §7 jobs | D3 |
| foundations §15a.1 erasure_log | C1 |
| foundations §4.7 marketing_consents + marketing_suppressions | C2 |
| §04 §5.1 transactional_email_log | E1 |
| §04 §6.1 sendTransactionalEmail | E2 |
| §04 §6.3 resolveDinerLocale | E2 |
| §04 §3 EmailShell | E2 |
| §04 §5.2 Resend webhook | E3 |
| §04 §6.2 sendTransactionalSms | F2 |
| §04 §5.3 Twilio webhook | F3 |
| build-order §13 leaf cascade columns | F4 |

**Placeholder scan:** No "TBD", "TODO", "implement later". Code blocks reference spec for full code. Test bullet lists are concrete enough to execute against.

**Scope check:** 18 commits is large but each is bite-sized (one migration OR one helper module OR one webhook). Order respects cross-sub-unit dependencies (C ships before D's pseudonymise cascade; E ships before D3).

**Type consistency:** `findOrCreateDinerForReservation` returns `{ dinerId, isNew }` — same across all calling sites. `ActionResult<T>` shared across actions. Audit threading via `currentActor()` matches phase-2 pattern.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-wave3-diners-comms.md`. Per established pattern, dispatching subagent-driven-development for execution.

Order: A1 → A2 → A3 → A4 → B1 → C1 → C2 → D1 → D2 → E1 → E2 → E3 → D3 (depends on E1) → F1 → F2 → F3 → F4 → G1.
