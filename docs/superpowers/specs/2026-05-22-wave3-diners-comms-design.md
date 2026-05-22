# Wave 3 — Diner CRM + Comms upgrade (§03 + §04)

**Date:** 2026-05-22
**Wave:** 3 (closes all 8 build-order units across §03 + §04)
**Spec source:**
- `docs/superpowers/architecture/03-diner-database.md` (entire doc)
- `docs/superpowers/architecture/04-diner-communication.md` (entire doc)
- `docs/superpowers/architecture/00-foundations.md` §4.7 (marketing tables), §15a.1 (erasure_log + redaction), §16.1/§16.2/§16.3 (registries), §6.6 (ingestWebhook), §7.1 (E.164, STOP)

---

## Problem

Wave 2 closed identity (§01) + bookings reconciliation (§02) + corporate-clients rename (§10). Wave 3 unlocks:

1. **A real diner record.** Today reservations carry `guest_name` / `guest_phone` / `guest_email` as bare columns on `reservations`. There's no cross-reservation continuity — a returning diner is treated as a new person every time. §03 introduces a `diners` table keyed by `(organization_id, phone)` (or `email` when phone is absent), an upsert helper that runs inside `createReservation`, mutation actions (`mergeDiners`, `splitDiner`), and a PII access log.
2. **A unified transactional comms log.** Today email sends call `sendEmail` (Resend wrapper) directly from server actions, with no record of what was sent, no delivery-status tracking, no idempotency. §04 introduces a `transactional_email_log` (single table with `channel` column for both email + SMS), wrappers (`sendTransactionalEmail`, `sendTransactionalSms`), and webhook handlers for Resend + Twilio status updates.
3. **Foundation substrate Wave 1 missed.** Three tables referenced by §03/§04 + foundations don't exist yet: `erasure_log` (foundations §15a.1, needed by `pseudonymiseDiner`), `marketing_consents` (foundations §4.7, needed by `sendTransactionalSms` consent gating), `marketing_suppressions` (foundations §4.7, needed by Resend bounce + Twilio STOP routing). These ship as part of Wave 3 to unblock §04.
4. **Two-phase erasure cascade leaf.** Build-order line 91 calls for `partner_notifications.pending_erasure` columns. Wave 3 ships the timestamp columns (`pending_erasure_at`, `redacted_at`); Wave 4 §13 ships the orchestrator that fills them in + nulls PII.

## Goals

1. `diners` table with org-scoped uniqueness, full RLS, and partial-unique indices that survive pseudonymisation.
2. `findOrCreateDinerForReservation` runs inside `createReservation` (existing service-role admin client). Every reservation post-Wave-3 has a `diner_id`. No backfill of historical reservations — they remain `diner_id = null`.
3. `diner_pii_access_log` writes one row per PII reveal (`accessKind: 'reveal' | 'export' | 'edit' | 'merge'`). `revealPiiBatch` wraps every bulk-read of diner PII.
4. `mergeDiners` + `splitDiner` server actions for partner staff reconciliation. Single-transaction, audit-logged, cross-org-rejected.
5. `pseudonymiseDiner` GDPR-pseudonymisation helper writing `erasure_log` row + cascading into `transactional_email_log` (Wave 3 inline; Wave 4 §13 orchestrator wraps later).
6. `transactional_email_log` unified table; `sendTransactionalEmail` + `sendTransactionalSms` wrappers replace direct `sendEmail` callsites; Resend + Twilio webhooks routed through `ingestWebhook` substrate.
7. Trilingual i18n key structure with RO copy filled in + EN/DE pointing to RO via fallback. Trilingual copy fill-in lands later.
8. Foundation tables (`erasure_log`, `marketing_consents`, `marketing_suppressions`) ship as part of Wave 3 to unblock §04 + §03 pseudonymisation.
9. `partner_notifications.pending_erasure_at` + `redacted_at` columns ship; logic deferred to Wave 4 §13.

## Non-goals

- **Diner detail page / search page UI** — Wave 3 ships the data layer + helpers + actions; UI surfaces are a follow-up after the helpers are proven via tests.
- **Trilingual copy fills (EN + DE)** — separate commit when the user has copy ready; Wave 3 ships RO + EN/DE-as-RO fallback.
- **`exportDinerData` DSAR ZIP export** — depends on signed-URL infra and the §13 cascade orchestrator. Defer to Wave 4.
- **iCal attachment + `data_export_ready` / `data_deletion_confirmed` email templates** — defer to Wave 4 alongside §13 DSAR work.
- **pg_trgm extension + trigram indices on diners** — search will work via plain `ILIKE`; trigram is a performance polish for when search latency becomes a problem.
- **Reservation-status-triggered aggregate jobs in Wave 3** — job substrate (pg-boss) is shipped, but the `diner.recompute-aggregates` enqueue calls in `createReservation` + reservation update actions wait for the partner UI to consume aggregates. Aggregates are visible-zero in v1 until UI surfaces them.
- **Wave 4 §13 orchestrator integration** — Wave 4 territory.
- **`restaurants.legal_name` / `tax_id` / `registration_number` / `billing_address`** — §05 columns (Wave 4). EmailShell tolerates these being null (conditional rendering).
- **`restaurant_translations.parking_note` / `dress_code`** — §05 columns (Wave 4). Confirmation email template renders conditionally on these.
- **Direct DB triggers for diner aggregates** — foundations §4.3 forbids; aggregates recomputed via app-level pg-boss jobs.

## Architecture overview

Six sub-units, sequential, ~18 commits.

| Sub-unit | Domain | Migrations | Helpers / actions | Tests |
|---|---|---|---|---|
| **A** — §03 Diner core | `diners` table + FK columns on reservations + reviews + `findOrCreateDinerForReservation` + `getDinerProfile` + `searchDiners` | 0021, 0022 | upsert, profile, search | unit + integration |
| **B** — §03 PII access log | `diner_pii_access_log` + `revealPiiBatch` helper | 0023 | reveal batch wrapper | unit |
| **C** — Foundations backfill | `erasure_log` + `marketing_consents` + `marketing_suppressions` | 0024, 0025 | none (substrate only) | none |
| **D** — §03 mutations + pseudonymise + jobs | `mergeDiners` + `splitDiner` + `pseudonymiseDiner` + 3 pg-boss jobs | none | three actions + job definitions | unit |
| **E** — §04 transactional email | `transactional_email_log` + `sendTransactionalEmail` + `resolveDinerLocale` + `EmailShell` refactor + Resend webhook | 0026 | wrapper + locale resolver + webhook handler | unit + integration |
| **F** — §04 SMS + Twilio + leaf column | `restaurants.transactional_sms_enabled` + `sendTransactionalSms` + Twilio webhook + `partner_notifications.pending_erasure` columns | 0027, 0028 | wrapper + STOP handler + webhook | unit |

Ordering matters: sub-unit C ships the foundations tables that D + E + F depend on. Sub-unit E ships `transactional_email_log` that D's `pseudonymiseDiner` cascades into.

---

## Sub-unit A — §03 Diner core

### Migration 0021 `diners` table + enum + RLS + indices

```sql
BEGIN;

CREATE TYPE diner_acquisition_source AS ENUM (
  'widget', 'venue_page', 'editorial', 'corporate',
  'walk_in', 'manual', 'import', 'email_campaign', 'api'
);

CREATE TABLE diners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone varchar(20),
  phone_raw varchar(40),
  email varchar(255),
  full_name varchar(200),
  locale char(2) NOT NULL DEFAULT 'ro',
  allergies text[] NOT NULL DEFAULT '{}',
  occasion_tags text[] NOT NULL DEFAULT '{}',
  seating_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  dietary_preferences text[] NOT NULL DEFAULT '{}',
  birthday_date date,
  anniversary_date date,
  internal_notes text,
  acquisition_source diner_acquisition_source,
  acquisition_restaurant_id uuid REFERENCES restaurants(id) ON DELETE SET NULL,
  visit_count integer NOT NULL DEFAULT 0,
  covers_total integer NOT NULL DEFAULT 0,
  first_visited_at timestamptz,
  last_visited_at timestamptz,
  frequency_bucket varchar(20) NOT NULL DEFAULT 'first_timer',
  typical_party_size_min integer,
  typical_party_size_max integer,
  no_show_count integer NOT NULL DEFAULT 0,
  cancellation_count integer NOT NULL DEFAULT 0,
  redacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diners_identity_required CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- Partial uniques. `redacted_at IS NULL` keeps pseudonymised rows from blocking new diners with the same contact.
CREATE UNIQUE INDEX diners_org_phone_unique
  ON diners(organization_id, phone)
  WHERE phone IS NOT NULL AND redacted_at IS NULL;

CREATE UNIQUE INDEX diners_org_email_unique
  ON diners(organization_id, lower(email))
  WHERE email IS NOT NULL AND phone IS NULL AND redacted_at IS NULL;

CREATE INDEX diners_org_full_name ON diners(organization_id, lower(full_name));
CREATE INDEX diners_org_phone ON diners(organization_id, phone);
CREATE INDEX diners_frequency
  ON diners(organization_id, frequency_bucket)
  WHERE redacted_at IS NULL;
CREATE INDEX diners_last_visited
  ON diners(organization_id, last_visited_at DESC)
  WHERE redacted_at IS NULL;

ALTER TABLE diners ENABLE ROW LEVEL SECURITY;

CREATE POLICY diners_admin_all ON diners
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY diners_org_member_select ON diners
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = diners.organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  ));

CREATE POLICY diners_org_admin_write ON diners
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = diners.organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND om.role IN ('owner', 'admin')
  ));

CREATE POLICY diners_venue_staff_select ON diners
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM restaurant_staff rs
    JOIN restaurants r ON r.id = rs.restaurant_id
    WHERE rs.user_id = auth.uid()
      AND rs.is_active = true
      AND r.organization_id = diners.organization_id
      AND EXISTS (
        SELECT 1 FROM reservations res
        WHERE res.restaurant_id = rs.restaurant_id
          AND res.diner_id = diners.id
      )
  ));

CREATE POLICY diners_venue_staff_update_notes ON diners
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM restaurant_staff rs
    JOIN restaurants r ON r.id = rs.restaurant_id
    WHERE rs.user_id = auth.uid()
      AND rs.is_active = true
      AND r.organization_id = diners.organization_id
      AND EXISTS (
        SELECT 1 FROM reservations res
        WHERE res.restaurant_id = rs.restaurant_id
          AND res.diner_id = diners.id
      )
  ));

COMMIT;
```

Drizzle schema mirror in `src/lib/db/schema.ts` follows the same column shape. `dinerAcquisitionSource` enum exported. The `diners` table mirrors the partial-unique indices via Drizzle's `index().where(...)` syntax.

### Migration 0022 — `reservations.diner_id` + `reviews.diner_id`

```sql
BEGIN;

ALTER TABLE reservations
  ADD COLUMN diner_id uuid REFERENCES diners(id) ON DELETE SET NULL;
CREATE INDEX reservations_diner ON reservations(diner_id);

ALTER TABLE reviews
  ADD COLUMN diner_id uuid REFERENCES diners(id) ON DELETE SET NULL;
CREATE INDEX reviews_diner ON reviews(diner_id);

COMMIT;
```

No backfill — historical rows stay `diner_id = NULL`. Only new reservations (post-A.3 deploy) link to diners.

### A.3 `findOrCreateDinerForReservation`

**File:** `src/lib/diners/upsert.ts`

```ts
import "server-only";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eq, and, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { diners, restaurants, cities } from "@/lib/db/schema";
import { normalizePhone } from "@/lib/phone/normalize";

export interface FindOrCreateDinerInput {
  organizationId: string;
  restaurantId: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  locale?: string;
  acquisitionSource: typeof DINER_ACQUISITION_SOURCES[number];
}

export interface FindOrCreateDinerResult {
  dinerId: string;
  isNew: boolean;
}

export const DINER_ACQUISITION_SOURCES = [
  "widget", "venue_page", "editorial", "corporate",
  "walk_in", "manual", "import", "email_campaign", "api",
] as const;

interface Deps {
  db: typeof dbAdmin;
}

export function makeFindOrCreateDinerForReservation(deps: Deps) {
  return async function findOrCreateDinerForReservation(
    input: FindOrCreateDinerInput,
  ): Promise<FindOrCreateDinerResult> {
    // 1. Validate identity requirement (matches DB CHECK constraint)
    if (!input.guestPhone && !input.guestEmail) {
      throw new Error("Diner upsert requires phone or email.");
    }

    // 2. Resolve restaurant country code for phone normalisation
    const restaurantRows = await deps.db
      .select({ countryCode: cities.countryCode })
      .from(restaurants)
      .innerJoin(cities, eq(cities.id, restaurants.cityId))
      .where(eq(restaurants.id, input.restaurantId))
      .limit(1);
    const countryCode = restaurantRows[0]?.countryCode ?? "RO";

    // 3. Normalize phone
    const phoneE164 = input.guestPhone
      ? normalizePhone(input.guestPhone, countryCode)
      : null;
    const phoneRaw = input.guestPhone ?? null;
    const email = input.guestEmail?.trim().toLowerCase() ?? null;
    const fullName = input.guestName.trim() || null;

    // 4. Try phone path first (it's the primary identity)
    if (phoneE164) {
      const existing = await deps.db
        .select({ id: diners.id })
        .from(diners)
        .where(
          and(
            eq(diners.organizationId, input.organizationId),
            eq(diners.phone, phoneE164),
            isNull(diners.redactedAt),
          ),
        )
        .limit(1);
      if (existing[0]) {
        // Soft-update missing fields
        await deps.db
          .update(diners)
          .set({
            email: sql`COALESCE(${diners.email}, ${email})`,
            fullName: sql`COALESCE(${diners.fullName}, ${fullName})`,
            updatedAt: new Date(),
          })
          .where(eq(diners.id, existing[0].id));
        return { dinerId: existing[0].id, isNew: false };
      }
    }

    // 5. Fall back to email-only path (when no phone OR phone not found)
    if (!phoneE164 && email) {
      const existing = await deps.db
        .select({ id: diners.id })
        .from(diners)
        .where(
          and(
            eq(diners.organizationId, input.organizationId),
            sql`lower(${diners.email}) = ${email}`,
            isNull(diners.phone),
            isNull(diners.redactedAt),
          ),
        )
        .limit(1);
      if (existing[0]) {
        await deps.db
          .update(diners)
          .set({
            fullName: sql`COALESCE(${diners.fullName}, ${fullName})`,
            updatedAt: new Date(),
          })
          .where(eq(diners.id, existing[0].id));
        return { dinerId: existing[0].id, isNew: false };
      }
    }

    // 6. Insert new diner
    const inserted = await deps.db
      .insert(diners)
      .values({
        organizationId: input.organizationId,
        phone: phoneE164,
        phoneRaw,
        email,
        fullName,
        locale: input.locale ?? "ro",
        acquisitionSource: input.acquisitionSource,
        acquisitionRestaurantId: input.restaurantId,
      })
      .returning({ id: diners.id });
    return { dinerId: inserted[0].id, isNew: true };
  };
}

export const findOrCreateDinerForReservation = makeFindOrCreateDinerForReservation({
  db: dbAdmin,
});
```

**Integration into `createReservation`** (`src/app/api/reservations/actions.ts`):

After the reservation row is inserted but BEFORE the audit row + email sends, look up the restaurant's `organization_id`, call `findOrCreateDinerForReservation`, then UPDATE the reservation with `diner_id`. Wrap the lookup + insert + update in the existing service-role admin client. No new transaction wrapping; the existing function already uses a single transaction.

Implementation note: `restaurants.organization_id` exists post-Wave 2 (§3.6 sub-unit A). Use that.

### A.4 `getDinerProfile` + `searchDiners` (server-only helpers)

`getDinerProfile(dinerId)` returns the diner's profile + visit history aggregated inline (no materialised view per §03 §4.4). Caller must `await revealPiiBatch(...)` to log the access — see sub-unit B.

`searchDiners({ orgId, query, limit?, offset? })` does plain `ILIKE` matching on `full_name`, `phone`, `email`. Trigram via pg_trgm is deferred to a polish commit. Returns MASKED phone (`+40 7•• ••• •89`) + masked email (`m•••e@gmail.com`). The page that consumes this calls `revealPiiBatch` to log the bulk access.

Both go in `src/lib/diners/profile.ts` and `src/lib/diners/search.ts` respectively. DI seam via factory.

**Phone masking helper:** `src/lib/diners/mask.ts` exports `maskPhone(e164)` and `maskEmail(addr)`.

### Files (sub-unit A)

**New:**
- `drizzle/migrations/0021_diners_table.sql`
- `drizzle/migrations/0022_diner_fk_columns.sql`
- `src/lib/db/schema/diners.ts` (or append to `schema.ts` per project pattern)
- `src/lib/diners/upsert.ts` + tests
- `src/lib/diners/profile.ts` + tests
- `src/lib/diners/search.ts` + tests
- `src/lib/diners/mask.ts` + tests

**Modified:**
- `src/lib/db/schema.ts` — add `diners` mirror + enum + FK columns on `reservations` + `reviews`
- `src/app/api/reservations/actions.ts` — call `findOrCreateDinerForReservation` after insert
- existing reservation-related tests — add `diner_id` to expected shapes; add an impersonator-aware assertion for the upsert callsite

**4 commits in sub-unit A.**

---

## Sub-unit B — §03 PII access log + reveal batch

### Migration 0023 `diner_pii_access_log`

```sql
BEGIN;

CREATE TABLE diner_pii_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diner_id uuid NOT NULL REFERENCES diners(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  accessed_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  accessed_field varchar(40) NOT NULL,
  access_kind varchar(20) NOT NULL,
  surface varchar(40),
  context_reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX diner_pii_access_log_diner ON diner_pii_access_log(diner_id, accessed_at DESC);
CREATE INDEX diner_pii_access_log_actor ON diner_pii_access_log(accessed_by_user_id, accessed_at DESC);

ALTER TABLE diner_pii_access_log ENABLE ROW LEVEL SECURITY;

-- Admin reads all
CREATE POLICY diner_pii_access_log_admin_all ON diner_pii_access_log
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Org members read their org's logs
CREATE POLICY diner_pii_access_log_org_member_select ON diner_pii_access_log
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = diner_pii_access_log.organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  ));

-- No INSERT/UPDATE/DELETE policies — service-role only (revealPiiBatch helper uses dbAdmin)

COMMIT;
```

### B.2 `revealPiiBatch` helper

**File:** `src/lib/diners/reveal-pii-batch.ts`

```ts
import "server-only";
import { dbAdmin } from "@/lib/db/admin";
import { dinerPiiAccessLog } from "@/lib/db/schema";

export interface RevealPiiBatchInput<T> {
  dinerIds: string[];
  organizationId: string;
  actorUserId: string;
  accessKind: "reveal" | "export" | "edit" | "merge";
  surface: string;
  accessedField: string;
  contextReservationId?: string;
  loader: (ids: string[]) => Promise<T[]>;
}

interface Deps { db: typeof dbAdmin }

export function makeRevealPiiBatch(deps: Deps) {
  return async function revealPiiBatch<T>(
    input: RevealPiiBatchInput<T>,
  ): Promise<T[]> {
    // Insert log rows FIRST (so a failed load can't silently leak access)
    if (input.dinerIds.length > 0) {
      await deps.db.insert(dinerPiiAccessLog).values(
        input.dinerIds.map((id) => ({
          dinerId: id,
          organizationId: input.organizationId,
          accessedByUserId: input.actorUserId,
          accessedField: input.accessedField,
          accessKind: input.accessKind,
          surface: input.surface,
          contextReservationId: input.contextReservationId,
        })),
      );
    }
    return input.loader(input.dinerIds);
  };
}

export const revealPiiBatch = makeRevealPiiBatch({ db: dbAdmin });
```

### Files (sub-unit B)

**New:**
- `drizzle/migrations/0023_diner_pii_access_log.sql`
- `src/lib/diners/reveal-pii-batch.ts` + tests

**Modified:**
- `src/lib/db/schema.ts` — add `dinerPiiAccessLog` mirror

**1 commit in sub-unit B** (the migration + mirror + helper + tests bundle naturally).

---

## Sub-unit C — Foundations backfill (erasure_log + marketing_consents + marketing_suppressions)

These three tables are foundations-level. They were referenced by §13/§04/§03 but Wave 1 didn't ship them. Shipping them in Wave 3 unblocks the rest.

### Migration 0024 `erasure_log` (foundations §15a.1)

```sql
BEGIN;

CREATE TABLE erasure_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type varchar(40) NOT NULL,  -- 'diner' | 'user' | 'reservation' | etc.
  subject_id uuid NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  reason varchar(80) NOT NULL,        -- 'dsar_erasure' | 'manual_pseudonymise' | 'auto_purge_pseudonymised' | etc.
  redacted_columns text[] NOT NULL DEFAULT '{}',
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  impersonator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX erasure_log_subject ON erasure_log(subject_type, subject_id);
CREATE INDEX erasure_log_actor ON erasure_log(actor_user_id, created_at DESC);
CREATE INDEX erasure_log_created ON erasure_log(created_at DESC);

ALTER TABLE erasure_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY erasure_log_admin_all ON erasure_log
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY erasure_log_org_owner_select ON erasure_log
  FOR SELECT
  USING (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = erasure_log.organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND om.role = 'owner'
  ));

-- No INSERT/UPDATE/DELETE policies — service-role writes only.

COMMIT;
```

### Migration 0025 `marketing_consents` + `marketing_suppressions` (foundations §4.7)

```sql
BEGIN;

-- One row per (diner, channel). Most recent revoked_at wins.
CREATE TABLE marketing_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diner_id uuid NOT NULL REFERENCES diners(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel varchar(30) NOT NULL,        -- 'email_marketing' | 'sms_marketing' | 'sms_transactional' | 'email_transactional'
  consent_given boolean NOT NULL,
  source varchar(40) NOT NULL,         -- 'booking_widget' | 'partner_portal_capture' | 'import' | 'email_confirmation'
  given_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT marketing_consents_channel_valid CHECK (
    channel IN ('email_marketing', 'sms_marketing', 'sms_transactional', 'email_transactional')
  )
);

CREATE INDEX marketing_consents_diner_channel
  ON marketing_consents(diner_id, channel, given_at DESC);

ALTER TABLE marketing_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketing_consents_admin_all ON marketing_consents
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY marketing_consents_org_member_select ON marketing_consents
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = marketing_consents.organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  ));

-- Suppression list: bounced emails, complained, STOP'd SMS, manual unsubscribes.
CREATE TABLE marketing_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel varchar(20) NOT NULL,        -- 'email' | 'sms'
  identifier varchar(255) NOT NULL,    -- email address or E.164 phone
  source varchar(40) NOT NULL,         -- 'bounce' | 'complaint' | 'sms_stop_keyword' | 'manual_unsubscribe'
  reason text,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_suppressions_channel_valid CHECK (channel IN ('email', 'sms'))
);

CREATE UNIQUE INDEX marketing_suppressions_channel_id_unique
  ON marketing_suppressions(channel, lower(identifier));

ALTER TABLE marketing_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketing_suppressions_admin_all ON marketing_suppressions
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Org members can SELECT their own org's suppressions (NULL organization_id = global, admin-only via the policy above)
CREATE POLICY marketing_suppressions_org_member_select ON marketing_suppressions
  FOR SELECT
  USING (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = marketing_suppressions.organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  ));

-- INSERT/UPDATE/DELETE: service-role only (webhook handlers + admin tooling).

COMMIT;
```

### Files (sub-unit C)

**New:**
- `drizzle/migrations/0024_erasure_log.sql`
- `drizzle/migrations/0025_marketing_consents_suppressions.sql`

**Modified:**
- `src/lib/db/schema.ts` — add three new mirrors

**2 commits in sub-unit C** — one per migration.

---

## Sub-unit D — §03 merge + split + pseudonymise + aggregate jobs

### D.1 `mergeDiners` server action

**File:** `src/app/partner/(dashboard)/diners/actions.ts`

```ts
"use server";

export interface MergeDinersInput {
  sourceId: string;
  targetId: string;
}

export async function mergeDinersAction(
  input: MergeDinersInput,
): Promise<ActionResult<{ targetDinerId: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Load both diners; verify same org
  const [source, target] = await dbAdmin
    .select(...)
    .from(diners)
    .where(inArray(diners.id, [input.sourceId, input.targetId]));
  if (!source || !target) return { ok: false, error: "Diner not found." };
  if (source.organizationId !== target.organizationId) {
    return { ok: false, error: "Cross-org merge not permitted." };
  }

  // Permission check: org admin/owner OR tavli_admin
  // (check org_members + profile.role)

  await dbAdmin.transaction(async (tx) => {
    // Update FK references: reservations + reviews
    await tx.update(reservations).set({ dinerId: input.targetId }).where(eq(reservations.dinerId, input.sourceId));
    await tx.update(reviews).set({ dinerId: input.targetId }).where(eq(reviews.dinerId, input.sourceId));

    // Profile merge: array union, jsonb merge, longer notes, target identity wins
    const mergedAllergies = [...new Set([...target.allergies, ...source.allergies])];
    const mergedOccasion = [...new Set([...target.occasionTags, ...source.occasionTags])];
    const mergedSeating = { ...source.seatingPreferences, ...target.seatingPreferences };
    const mergedNotes = mergeNotes(target.internalNotes, source.internalNotes);

    await tx.update(diners).set({
      allergies: mergedAllergies,
      occasionTags: mergedOccasion,
      seatingPreferences: mergedSeating,
      internalNotes: mergedNotes,
      updatedAt: new Date(),
    }).where(eq(diners.id, input.targetId));

    await tx.delete(diners).where(eq(diners.id, input.sourceId));
  });

  const actor = await currentActor(user.id);
  await recordAudit({
    action: AUDIT.diner.merged,
    subjectType: "diner",
    subjectId: input.targetId,
    actorUserId: actor.actorUserId,
    impersonatorUserId: actor.impersonatorUserId ?? undefined,
    actorRole: "venue_owner",
    context: { source_diner_id: input.sourceId, target_diner_id: input.targetId },
  });

  return { ok: true, data: { targetDinerId: input.targetId } };
}

function mergeNotes(target: string | null, source: string | null): string | null {
  if (!source && !target) return null;
  if (!source) return target;
  if (!target) return source;
  return target.length >= source.length ? target : source;
}
```

### D.2 `splitDiner` server action

```ts
export interface SplitDinerInput {
  sourceId: string;
  reservationIds: string[];
  newDiner: { fullName: string; phone?: string; email?: string };
}

export async function splitDinerAction(
  input: SplitDinerInput,
): Promise<ActionResult<{ newDinerId: string }>>
```

- Validate: at least one of phone/email; identity ≠ source identity (would collide on partial unique).
- Validate: every `reservationIds[i]` belongs to source diner's org.
- Single transaction: INSERT new diner → UPDATE reservations + reviews → audit.

### D.3 `pseudonymiseDiner` helper

**File:** `src/lib/diners/pseudonymise.ts`

```ts
import "server-only";
import { dbAdmin } from "@/lib/db/admin";
import { diners, reservations, reviews, transactionalEmailLog, erasureLog } from "@/lib/db/schema";

export interface PseudonymiseDinerInput {
  dinerId: string;
  reason: string;
  actorUserId: string;
  impersonatorUserId?: string;
}

export async function pseudonymiseDiner(input: PseudonymiseDinerInput): Promise<void> {
  await dbAdmin.transaction(async (tx) => {
    const now = new Date();
    const redactedColumns: string[] = [];

    // 1. Null PII on diner + set redacted_at
    await tx.update(diners).set({
      phone: null,
      phoneRaw: null,
      email: null,
      fullName: null,
      internalNotes: null,
      allergies: [],
      occasionTags: [],
      seatingPreferences: {},
      dietaryPreferences: [],
      birthdayDate: null,
      anniversaryDate: null,
      redactedAt: now,
      updatedAt: now,
    }).where(eq(diners.id, input.dinerId));
    redactedColumns.push("phone", "phone_raw", "email", "full_name", "internal_notes");

    // 2. Cascade into reservations (null guest_*)
    await tx.update(reservations).set({
      guestName: null,
      guestPhone: null,
      guestEmail: null,
    }).where(eq(reservations.dinerId, input.dinerId));

    // 3. Cascade into reviews (null first_name)
    await tx.update(reviews).set({ firstName: null }).where(eq(reviews.dinerId, input.dinerId));

    // 4. Cascade into transactional_email_log (null email + phone, set redacted_at)
    await tx.update(transactionalEmailLog).set({
      email: null,
      phone: null,
      redactedAt: now,
    }).where(eq(transactionalEmailLog.dinerId, input.dinerId));

    // 5. Write erasure_log row
    await tx.insert(erasureLog).values({
      subjectType: "diner",
      subjectId: input.dinerId,
      reason: input.reason,
      redactedColumns,
      actorUserId: input.actorUserId,
      impersonatorUserId: input.impersonatorUserId,
    });
  });

  // 6. Audit (outside transaction)
  await recordAudit({
    action: AUDIT.diner.pseudonymised,
    subjectType: "diner",
    subjectId: input.dinerId,
    actorUserId: input.actorUserId,
    impersonatorUserId: input.impersonatorUserId,
    actorRole: "venue_owner",
    context: { reason: input.reason },
  });
  await recordAudit({
    action: AUDIT.compliance.erasure_executed,
    subjectType: "diner",
    subjectId: input.dinerId,
    actorUserId: input.actorUserId,
    impersonatorUserId: input.impersonatorUserId,
    actorRole: "venue_owner",
    context: { reason: input.reason, redacted_columns: redactedColumns },
  });
}
```

### D.4 pg-boss jobs

**Files:** `src/lib/jobs/diners.ts` (new), `src/lib/jobs/registry.ts` (modified — add 3 keys).

Three jobs:
- `diner.recompute-aggregates` — on-demand enqueue from reservation status changes. Recomputes `visit_count`, `covers_total`, `first_visited_at`, `last_visited_at`, `no_show_count`, `cancellation_count`, `frequency_bucket` for the affected diner.
- `diner.frequency-bucket-rebalance` — nightly 04:00 UTC. Recomputes `frequency_bucket` for every active diner (handles passage of time).
- `diner.purge-pseudonymised` — nightly 05:00 UTC. Hard-deletes diners where `redacted_at < now() - interval '30 days'`.

Enqueue points: reservation status change in `partner/(dashboard)/reservations/actions.ts`. **Per non-goals**, the enqueue call lands but the job doesn't yet drive a partner UI — aggregates remain visible-zero until UI surfaces ship.

### Files (sub-unit D)

**New:**
- `src/app/partner/(dashboard)/diners/actions.ts` (mergeDinersAction + splitDinerAction)
- `src/lib/diners/pseudonymise.ts` + tests
- `src/lib/jobs/diners.ts` (3 job definitions)

**Modified:**
- `src/lib/jobs/registry.ts` — register 3 new keys
- `src/app/partner/(dashboard)/reservations/actions.ts` — enqueue `diner.recompute-aggregates` on status changes (where reservation has `diner_id`)

**3 commits in sub-unit D** — merge+split, pseudonymise, jobs.

---

## Sub-unit E — §04 transactional email + Resend webhook

### Migration 0026 `transactional_email_log`

```sql
BEGIN;

CREATE TABLE transactional_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key varchar(60) NOT NULL,
  email varchar(255),
  phone varchar(20),
  diner_id uuid REFERENCES diners(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  organization_id_at_event uuid NOT NULL,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE SET NULL,
  channel varchar(20) NOT NULL,
  locale char(2) NOT NULL,
  subject varchar(300),
  resend_message_id varchar(80),
  twilio_message_sid varchar(80),
  email_status varchar(20),
  sms_status varchar(20),
  status_updated_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  redacted_at timestamptz,
  CONSTRAINT transactional_log_status_per_channel CHECK (
    (channel = 'email' AND email_status IS NOT NULL AND sms_status IS NULL)
    OR (channel = 'sms' AND sms_status IS NOT NULL AND email_status IS NULL)
  ),
  CONSTRAINT transactional_log_channel_valid CHECK (channel IN ('email', 'sms')),
  CONSTRAINT transactional_log_email_status_valid CHECK (
    email_status IS NULL OR email_status IN ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed')
  ),
  CONSTRAINT transactional_log_sms_status_valid CHECK (
    sms_status IS NULL OR sms_status IN ('queued', 'sent', 'delivered', 'undelivered', 'failed', 'optout')
  )
);

CREATE INDEX transactional_email_log_diner ON transactional_email_log(diner_id, created_at DESC);
CREATE INDEX transactional_email_log_reservation ON transactional_email_log(reservation_id, created_at DESC);
CREATE UNIQUE INDEX transactional_email_log_resend
  ON transactional_email_log(resend_message_id)
  WHERE resend_message_id IS NOT NULL;
CREATE UNIQUE INDEX transactional_email_log_twilio
  ON transactional_email_log(twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL;

ALTER TABLE transactional_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactional_email_log_admin_all ON transactional_email_log
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY transactional_email_log_org_member_select ON transactional_email_log
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = transactional_email_log.organization_id_at_event
      AND om.user_id = auth.uid()
      AND om.is_active = true
  ));

-- INSERT/UPDATE: service-role only (the wrapper + webhook handlers).

COMMIT;
```

**Note on build-order shorthand:** build-order line 88 mentions "`transactional_email_log` + `sms_log`". §04 §5.1 specifies one unified table with a `channel` column instead of two parallel tables. We follow the architecture spec.

### E.2 `sendTransactionalEmail` wrapper

**File:** `src/lib/email/send-transactional.ts`

```ts
import "server-only";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { dbAdmin } from "@/lib/db/admin";
import { transactionalEmailLog } from "@/lib/db/schema";

export type TransactionalTemplateKey =
  | "reservation_confirmation"
  | "reservation_reminder_24h"
  | "reservation_cancelled"
  | "reservation_modified"
  | "review_request"
  | "partner_booking_alert"
  | "staff_invitation"
  | "password_reset"
  | "email_verification"
  | "data_export_ready";   // template registered; impl ships in Wave 4

export interface SendTransactionalEmailInput {
  to: string;
  locale: "ro" | "en" | "de";
  template: TransactionalTemplateKey;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props: Record<string, any>;
  context: {
    reservation_id?: string;
    diner_id?: string;
    restaurant_id?: string;
    organization_id?: string;
  };
}

interface Deps {
  resend: { emails: { send: (input: { from: string; to: string; subject: string; html: string; text: string }) => Promise<{ data?: { id: string }; error?: { message: string } }> } };
  db: typeof dbAdmin;
}

export function makeSendTransactionalEmail(deps: Deps) {
  return async function sendTransactionalEmail(
    input: SendTransactionalEmailInput,
  ): Promise<ActionResult<{ messageId: string }>> {
    // Honour dev override
    const recipient = process.env.EMAIL_DEV_FORCED_RECIPIENT ?? input.to;

    // Render template
    const { html, text, subject } = await renderTemplate(input.template, input.locale, input.props);

    // `organization_id_at_event` is NOT NULL by schema — caller must provide it.
    // For transactional emails that have no org context (e.g., password reset for
    // a tavli_admin), resolve to the Tavli platform org UUID stored in env
    // PLATFORM_ORG_ID; if missing, throw rather than silently storing a sentinel.
    const orgIdAtEvent =
      input.context.organization_id ?? process.env.PLATFORM_ORG_ID;
    if (!orgIdAtEvent) {
      return { ok: false, error: "Email context missing organization_id and PLATFORM_ORG_ID not set." };
    }

    // Pre-insert log row with status='queued'
    const insertedRows = await deps.db.insert(transactionalEmailLog).values({
      templateKey: input.template,
      email: recipient,
      dinerId: input.context.diner_id ?? null,
      reservationId: input.context.reservation_id ?? null,
      organizationId: input.context.organization_id ?? null,
      organizationIdAtEvent: orgIdAtEvent,
      restaurantId: input.context.restaurant_id ?? null,
      channel: "email",
      locale: input.locale,
      subject,
      emailStatus: "queued",
    }).returning({ id: transactionalEmailLog.id });

    // Send
    const { data, error } = await deps.resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Tavli <hello@tavli.ro>",
      to: recipient,
      subject,
      html,
      text,
    });

    if (error || !data?.id) {
      await deps.db.update(transactionalEmailLog).set({
        emailStatus: "failed",
        failureReason: error?.message ?? "Unknown send failure.",
        statusUpdatedAt: new Date(),
      }).where(eq(transactionalEmailLog.id, insertedRows[0].id));
      return { ok: false, error: error?.message ?? "Email send failed." };
    }

    await deps.db.update(transactionalEmailLog).set({
      emailStatus: "sent",
      resendMessageId: data.id,
      statusUpdatedAt: new Date(),
    }).where(eq(transactionalEmailLog.id, insertedRows[0].id));

    return { ok: true, data: { messageId: data.id } };
  };
}
```

`renderTemplate(template, locale, props)` is a separate module that imports the React Email template, applies the locale catalogue, and returns `{ html, text, subject }`. Templates live in `src/emails/`.

**i18n catalogue structure:** `src/emails/messages/<locale>/<template>.json` — RO files filled in; EN + DE files exist but re-export RO via a fallback resolver. The locale resolver returns the requested locale's catalogue if present and non-empty, else falls back to RO.

**EmailShell:** `src/emails/_shell/EmailShell.tsx` — wraps every template with header (logo, restaurant name) + footer. Legal disclosure block (legal_name, tax_id, registration_number, billing_address) renders conditionally — null fields are skipped. Templates that don't pass restaurant info skip the entire footer.

### E.3 `resolveDinerLocale` helper

**File:** `src/lib/email/resolve-locale.ts`

```ts
export function resolveDinerLocale(input: {
  diner?: { locale?: string | null };
  reservation?: { locale?: string | null };
  restaurant: { locale: string };
}): "ro" | "en" | "de" {
  const order = [input.diner?.locale, input.reservation?.locale, input.restaurant.locale, "ro"];
  for (const candidate of order) {
    if (candidate === "ro" || candidate === "en" || candidate === "de") return candidate;
  }
  return "ro";
}
```

### E.4 `/api/webhooks/resend/route.ts`

**File:** `src/app/api/webhooks/resend/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ingestWebhook } from "@/lib/webhooks/handle";
import { dbAdmin } from "@/lib/db/admin";
import { transactionalEmailLog, marketingSuppressions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await request.text();
  const signature = request.headers.get("svix-signature") ?? request.headers.get("resend-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 401 });

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 500 });

  // Resend uses Svix-style webhooks: svix-id + svix-timestamp + svix-signature headers.
  // The signature header contains one or more space-separated `v1,<base64sig>` values.
  // We verify by computing HMAC-SHA256(secret, `${svix_id}.${svix_timestamp}.${raw}`).
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  if (!svixId || !svixTimestamp) {
    return NextResponse.json({ error: "missing svix headers" }, { status: 401 });
  }
  const signedPayload = `${svixId}.${svixTimestamp}.${raw}`;
  const expected = createHmac("sha256", Buffer.from(secret.replace(/^whsec_/, ""), "base64"))
    .update(signedPayload)
    .digest();
  const signatures = signature.split(" ").map((s) => s.split(",")[1]).filter(Boolean);
  const matched = signatures.some((sig) => {
    try {
      return timingSafeEqual(expected, Buffer.from(sig, "base64"));
    } catch {
      return false;
    }
  });
  if (!matched) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(raw);
  const eventId = payload.id ?? payload.event?.id;
  const eventType = payload.type;
  const messageId = payload.data?.email_id ?? payload.data?.message_id;

  // Route through ingestWebhook for idempotency
  const result = await ingestWebhook({
    provider: "resend",
    providerEventId: eventId,
    payload,
    handle: async () => {
      if (!messageId) return;
      const newStatus = mapResendEventToStatus(eventType);
      await dbAdmin.update(transactionalEmailLog).set({
        emailStatus: newStatus,
        statusUpdatedAt: new Date(),
        failureReason: payload.data?.bounce?.message ?? null,
      }).where(eq(transactionalEmailLog.resendMessageId, messageId));

      // On bounce/complain: add to marketing_suppressions
      if (eventType === "email.bounced" || eventType === "email.complained") {
        const targetEmail = payload.data?.to?.[0];
        if (targetEmail) {
          await dbAdmin.insert(marketingSuppressions).values({
            channel: "email",
            identifier: targetEmail,
            source: eventType === "email.bounced" ? "bounce" : "complaint",
            reason: payload.data?.bounce?.message ?? null,
          }).onConflictDoNothing();
        }
      }
    },
  });

  return NextResponse.json({ ok: result.ok });
}
```

### Files (sub-unit E)

**New:**
- `drizzle/migrations/0026_transactional_email_log.sql`
- `src/lib/email/send-transactional.ts` + tests
- `src/lib/email/resolve-locale.ts` + tests
- `src/lib/email/render-template.ts` + tests (template renderer)
- `src/emails/_shell/EmailShell.tsx` (server component)
- `src/emails/messages/ro/*.json` (10 templates, RO filled)
- `src/emails/messages/en/*.json` (10 templates, fallback)
- `src/emails/messages/de/*.json` (10 templates, fallback)
- `src/app/api/webhooks/resend/route.ts` + tests

**Modified:**
- `src/lib/db/schema.ts` — add `transactionalEmailLog` + `marketingConsents` + `marketingSuppressions` mirrors
- Existing email send-sites (`src/app/api/reservations/actions.ts`, `src/app/api/event-requests/actions.ts`, etc.) — replace `sendEmail` calls with `sendTransactionalEmail`. Match templates carefully — see file inventory.
- existing tests — update expected shapes to match

**3 commits in sub-unit E** — migration + mirror, wrapper + templates + EmailShell, webhook.

---

## Sub-unit F — §04 SMS + Twilio + leaf column

### Migration 0027 `restaurants.transactional_sms_enabled`

```sql
ALTER TABLE restaurants ADD COLUMN transactional_sms_enabled boolean NOT NULL DEFAULT false;
```

### F.2 `sendTransactionalSms` wrapper

**File:** `src/lib/sms/send-transactional.ts`

```ts
import "server-only";
import twilio from "twilio";
import { normalizePhone } from "@/lib/phone/normalize";

export interface SendTransactionalSmsInput {
  to: string;
  locale: "ro" | "en" | "de";
  template: SmsTemplateKey;
  props: Record<string, unknown>;
  context: { reservation_id?: string; diner_id?: string; restaurant_id?: string; organization_id?: string };
  // For consent + restaurant-gate lookups
  restaurantCountryCode: string;
  restaurantSmsEnabled: boolean;
  dinerId?: string;
}

export type SmsTemplateKey =
  | "reservation_confirmation_sms"
  | "reservation_reminder_24h_sms"
  | "reservation_cancelled_sms";

export async function sendTransactionalSms(
  input: SendTransactionalSmsInput,
): Promise<ActionResult<{ messageSid: string }>>
```

Pre-send checks (in order):
1. Normalize phone via `normalizePhone(input.to, input.restaurantCountryCode)` — fail if not E.164.
2. Restaurant gate: `restaurantSmsEnabled` must be true.
3. Consent check: `marketing_consents` row with `channel='sms_transactional'` + `consent_given=true` + `revoked_at IS NULL` for `dinerId`. Skip if no dinerId (anonymous booking SMS goes out without consent gate — anonymous booker implicitly consents at the form).
4. Suppression check: not in `marketing_suppressions` for `channel='sms'`, `identifier=phoneE164`.
5. Idempotency: no previous `sent`/`delivered` row in last 24h for same `(diner_id, reservation_id, template_key)`.

Then render template + insert log row with `sms_status='queued'` + call Twilio + update log status.

### F.3 `/api/webhooks/twilio-sms-status/route.ts`

Twilio sends status updates via POST form-urlencoded. Verify the X-Twilio-Signature header. Map `MessageStatus` → `sms_status` enum. Update log row.

STOP keyword: Twilio inbound message webhook is a separate route (handled by a shared inbound-STOP handler). For this Wave, ship the status webhook only; the inbound message webhook (for handling STOP) is referenced as a future addition.

### Migration 0028 `partner_notifications.pending_erasure`

```sql
ALTER TABLE partner_notifications
  ADD COLUMN pending_erasure_at timestamptz,
  ADD COLUMN redacted_at timestamptz;
```

No logic — columns added; Wave 4 §13 fills them in.

### Files (sub-unit F)

**New:**
- `drizzle/migrations/0027_restaurant_transactional_sms.sql`
- `drizzle/migrations/0028_partner_notifications_pending_erasure.sql`
- `src/lib/sms/send-transactional.ts` + tests
- `src/lib/sms/render-template.ts` (SMS template renderer — plain text)
- `src/emails/messages/ro/sms/*.json` (3 SMS templates, RO)
- `src/emails/messages/en/sms/*.json` (fallback)
- `src/emails/messages/de/sms/*.json` (fallback)
- `src/app/api/webhooks/twilio-sms-status/route.ts` + tests

**Modified:**
- `src/lib/db/schema.ts` — add `transactional_sms_enabled` to restaurants mirror + `pending_erasure_at` / `redacted_at` to partnerNotifications mirror

**4 commits in sub-unit F** — restaurant column, SMS wrapper, Twilio webhook, partner_notifications column.

---

## Cross-cutting decisions

### Spec divergence from build-order shorthand (documented)

- Build-order line 84 says "`diner_phone_links` + `diner_email_links`" — §03 §4.1 uses partial unique indices on `diners.phone` + `diners.email` instead. No separate link tables.
- Build-order line 88 says "`transactional_email_log` + `sms_log`" — §04 §5.1 uses one unified table with a `channel` column.

The architecture spec wins; design doc calls these out explicitly so reviewers don't expect parallel tables.

### Anonymous public booking diner upsert

`createReservation` in `src/app/api/reservations/actions.ts` already uses `createSupabaseAdminClient()` (service-role). The diner upsert runs inside that path, bypassing RLS naturally. No new SECURITY DEFINER RPC needed.

### `pseudonymiseDiner` cascade timing

Wave 3 inline-cascades into `transactional_email_log`. Wave 4 §13's two-phase orchestrator (`/lib/compliance/erasure-cascade.ts`, not in Wave 3) will eventually wrap pseudonymise as one step in the full cascade. For Wave 3, calling `pseudonymiseDiner` directly is the supported path.

### `partner_notifications.pending_erasure_*` columns

Timestamps land in Wave 3 (sub-unit F, migration 0028). Column-nulling logic — which PII columns on partner_notifications get nulled, in what order, by which job — defers to Wave 4 §13. Wave 3 ships the substrate so Wave 4 doesn't need a migration.

### EmailShell legal disclosure block

Renders `restaurants.legal_name`, `tax_id`, `registration_number`, `billing_address` IF present (they're §05 columns, Wave 4). Wave 3 EmailShell checks each field and renders conditionally. No errors if the columns return null; the footer just shows fewer lines.

### `restaurant_translations.parking_note` / `dress_code`

The reservation confirmation template renders these lines conditionally. §05 (Wave 4) ships the columns. Until then, the template skips those lines.

### Trilingual i18n stub strategy

- `src/emails/messages/ro/<template>.json` — RO copy filled by Tavli copy team (Henrick personally per memory).
- `src/emails/messages/en/<template>.json` — file exists but is a fallback stub that re-exports the RO content.
- `src/emails/messages/de/<template>.json` — same.
- A resolver helper (`src/emails/messages/loader.ts`) loads the requested locale; if a key is missing or the file is the fallback stub, it falls back to RO.

When Henrick has EN + DE copy, the JSON files are filled in. No code changes needed. The system is i18n-complete in structure but content-incomplete in EN+DE.

### ERROR_CODES

- §03 owns TV100–TV199; Wave 3 reserves and pins specific codes for: phone-or-email-required (TV100), cross-org-merge (TV101), split-identity-collision (TV102), split-reservation-not-owned (TV103), diner-already-pseudonymised (TV104), upsert-race-anomaly (TV105).
- §04 owns TV200–TV299; Wave 3 reserves and pins: E.164-normalisation-failed (TV200), transactional-sms-gated-off (TV201), transactional-sms-consent-missing (TV202), transactional-sms-suppressed (TV203), resend-send-failure (TV204), twilio-send-failure (TV205), webhook-signature-failed (TV206).

### Audit registry verification

Verified: all 6 keys needed by §03 + §04 (`diner.pii_accessed`, `diner.merged`, `diner.split`, `diner.pseudonymised`, `diner.deleted`, `compliance.erasure_executed`, `compliance.dsar_exported`) already exist in `src/lib/audit/actions.ts`. No registry additions needed.

§04 explicitly does NOT write `audit_logs` rows (the log table is the audit trail).

### JOBS registry additions

Three new keys in `src/lib/jobs/registry.ts`:
- `diner.recompute-aggregates`
- `diner.frequency-bucket-rebalance`
- `diner.purge-pseudonymised`

---

## Testing strategy

### Unit tests (per sub-unit)

- **A**: `upsert.ts` (phone path / email path / new insert / cross-org separation / collision retry); `profile.ts` (aggregate query); `search.ts` (ILIKE match shape); `mask.ts` (phone + email masking)
- **B**: `reveal-pii-batch.ts` (log row shape + loader invocation order)
- **C**: substrate-only migrations; schema mirror typecheck
- **D**: `mergeDiners` (happy path / cross-org rejection / FK updates / audit shape); `splitDiner` (happy path / identity-collision / reservation-not-owned); `pseudonymiseDiner` (PII nulled + erasure_log row + cascade into transactional_email_log + 2 audit rows)
- **E**: `sendTransactionalEmail` (queued → sent transitions + failed-update); `resolveDinerLocale` (priority order); Resend webhook (signature verify / event mapping / suppression insert on bounce)
- **F**: `sendTransactionalSms` (E.164 normalize / gate check / consent check / suppression check / idempotency check / queued → sent); Twilio webhook (signature verify / status mapping)

### Integration tests

- End-to-end reservation create → diner upserted → confirmation email sent → log row exists with status='sent'.
- pseudonymiseDiner → diner PII nulled + reservations.guest_* nulled + transactional_email_log redacted.

### Manual smoke

After all 18 commits, end-to-end on local Supabase:
1. Anonymous public booking flow → reservation created → diner record auto-created → confirmation email queued (visible in transactional_email_log).
2. Partner staff opens reservation detail (UI doesn't exist in Wave 3 — verify via direct query).
3. Pseudonymise a test diner → verify all PII columns null + log row written.

---

## Migration numbers

- `0021_diners_table.sql`
- `0022_diner_fk_columns.sql`
- `0023_diner_pii_access_log.sql`
- `0024_erasure_log.sql`
- `0025_marketing_consents_suppressions.sql`
- `0026_transactional_email_log.sql`
- `0027_restaurant_transactional_sms.sql`
- `0028_partner_notifications_pending_erasure.sql`

8 migrations total. All forward-only per Tavli convention. Each follows the §3.7 RLS pattern (narrow SELECT for self/org, service-role writes, no FOR ALL mutate policy).

---

## Known limitations / follow-ups (documented)

- **Aggregate jobs are visible-zero** until partner UI consumes them (Wave 3 ships the enqueue + recompute logic, but no UI surface displays the numbers).
- **EN/DE email copy is RO-fallback** until Henrick fills the catalogues. System is trilingual-ready in structure.
- **No diner detail page / search page UI** — data layer + helpers ship; UI is a follow-up.
- **No DSAR ZIP export** (`exportDinerData`) — Wave 4 territory.
- **pg_trgm trigram indices on diners** — deferred; search will work via plain ILIKE.
- **Twilio inbound STOP webhook** — Wave 3 ships the status webhook only. STOP keyword handling is a Wave 4 follow-up.
- **Wave 4 §13 orchestrator** — Wave 3's `pseudonymiseDiner` is callable directly; §13 will eventually wrap it as one step in the full GDPR cascade.

---

## Commit plan handoff

Eighteen sequential commits across six sub-units (A → F). Each migration-bearing commit uses the 3-step deploy bookkeeping (psql -f, drizzle journal entry, schema mirror commit) per `~/.claude/projects/.../memory/deploy_setup.md`.

After all 18 sub-units ship: build-order entries §03 (4 lines) + §04 (4 lines) annotated `[x]`. Wave 3 closed.
