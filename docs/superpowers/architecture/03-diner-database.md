# 03 — Diner Database (Per-Venue + Cross-Venue)

> Persistent diner records, visit history, profile data (allergies, occasions, preferences, notes), per-venue scoping for Base, organization-scoped pooling for Pro. The single most consequential greenfield build in the spec.

**Dependencies:** last verified compatible with `00-foundations.md` 2026-05-20. Re-check on foundations contract changes — specifically §3.2 `ActionResult<T>`, §3.4 `can()`/`requireCan()`, §4.7 foundation tables (`marketing_consents` referenced from §11), §7.1 phone E.164 normalisation, §15a.1 GDPR erasure (30-day reversibility), §16.1 ERROR_CODES (TV100–TV199 owned here), §16.2 AUDIT actions.

## Contents

- [1. Scope](#1-scope)
- [2. Current state](#2-current-state)
- [3. Architectural decision: where does a diner live?](#3-architectural-decision-where-does-a-diner-live) — **non-template; this domain's foundational scoping decision**
- [4. Data model](#4-data-model) — `diners`, `reservations.diner_id`, `reviews.diner_id`, RLS
- [5. APIs / interfaces](#5-apis--interfaces) — upsert algorithm, merge/split, search, PII masking, cross-org isolation
- [6. UI surfaces](#6-ui-surfaces)
- [7. Background jobs](#7-background-jobs)
- [8. Compliance & audit hooks](#8-compliance--audit-hooks) — `diner_pii_access_log`, pseudonymisation, GDPR export
- [9. Build sequence](#9-build-sequence)
- [10. Open questions](#10-open-questions)
- [11. Cross-references](#11-cross-references)

## 1. Scope

This domain owns: the persistent diner record, the link between every booking (past + future) and a diner, the merge/dedup logic that prevents the same phone number from creating five separate records, and the visibility model that scopes diner data correctly for Base and Pro tiers.

It does **not** own: the marketing consent records (→ §11 — distinct from a diner profile because consent has its own audit obligations), the campaign send history per diner (→ §11), or the booking itself (→ §02). It is the noun that bookings and campaigns refer to.

### Checkboxes covered

Status markers per README: `[ ]` = unshipped, `[x]` = shipped against this doc. Inline notes flag partial state.

From LFC §1 Tavli (Base) "Customer database (single venue, Base scope)":
- [ ] Diner profile with visit history at that venue
- [ ] Allergy / occasion / preference fields
- [ ] Notes on diner

From LFC §1 also (capture surface):
- [ ] Allergy / occasion / seating preferences captured at booking and visible the moment a diner walks in *(reservation form already captures these fields; the persistence layer — this domain — is what's missing)*

From LFC §2 Tavli Pro "Cross-venue customer database (NEW — committed 2026-05-19)":
- [ ] Organization-level entity above restaurant *(designed in §01 — this doc consumes it)*
- [ ] Shared customer pool scoped to legal entity
- [ ] Visit history aggregated across all venues for a single diner
- [ ] Visibility controls (which staff at which venue see which diner data)
- [ ] GDPR-clean separation between legal entities
- [ ] Cross-venue search / dedup

## 2. Current state

There is **no `customers` or `diners` table in the schema**. Every reservation row carries `guest_name`, `guest_phone`, `guest_email`, `notes`, `zone` directly. Reviews capture a denormalised `first_name` + `party_size` snapshot but no link to a persistent diner.

This means:
- No visit history rendered today. The same phone booking five times looks like five strangers.
- No allergy carry-over across visits.
- No way to seed the cross-venue customer pool — it's not just "expose a query," it's "build the table."
- No marketing list — the spec's "List building" + "Segmentation" features in §11 have nothing to segment over until this domain exists.

**Existing data to migrate.** Tavli is pre-release; no production rows exist. Dev environments are reseeded against the new schema as part of the migration (see §9 step 4). No backfill from historical `reservations` rows is required — the rows that exist in dev are test data, not customer data.

## 3. Architectural decision: where does a diner live?

Three candidate scopes were considered:

**A. Diner scoped to `organization_id`** *(chosen)*
- One diner row per (org, phone). Within an org, all venues see the same diner.
- Cross-org is invisible by design — two unrelated chains each have their own diner record for the same person. GDPR-clean: legal entities don't share PII.
- Matches the spec exactly: "Shared customer pool scoped to legal entity."

**B. Diner scoped globally** (rejected)
- One row per phone number, visibility controlled by per-org joins.
- Tempting for dedup but legally fraught: it implies cross-tenant PII residence in one table, requiring a much more complex GDPR audit. Also collapses if two orgs have legitimately different opinions about the same diner (different allergies, different consent state).

**C. Diner scoped per `restaurant_id`** (rejected)
- Each venue has its own diner table.
- Works for Base. Fails Pro: a Pro org's value proposition is precisely that the diner is one record across all venues. A scoped-per-venue model would force expensive joins to reassemble a cross-venue view and would lose dedup across venues.

**Choice rationale.** Scope A is the only model that satisfies both Base and Pro without forking. For a Base operator (org with one venue), "diner scoped to org" trivially reduces to "diner scoped to that one venue." For Pro, the cross-venue feature is a natural read of the same model.

## 4. Data model

### 4.1 New table: `diners`

```sql
create type diner_acquisition_source as enum (
  'widget', 'venue_page', 'editorial', 'corporate',
  'walk_in', 'manual', 'import', 'email_campaign', 'api'
);

create table diners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,

  -- Identity (at least one of phone or email required)
  phone varchar(20),                                         -- E.164 normalised
  phone_raw varchar(40),                                     -- original as entered (for display + debugging)
  email varchar(255),
  full_name varchar(200),

  -- Locale preference
  locale char(2) not null default 'ro',

  -- Profile fields (visible to venue staff and org members)
  allergies text[] not null default '{}',                    -- ['nuts', 'gluten', 'shellfish', ...]
  occasion_tags text[] not null default '{}',                -- ['birthday', 'business', 'date_night', ...]
  seating_preferences jsonb not null default '{}'::jsonb,    -- { 'window': true, 'quiet': true, 'high_chair': false }
  dietary_preferences text[] not null default '{}',          -- ['vegetarian', 'vegan', 'halal', 'kosher']
  birthday_date date,                                         -- consumed by §11 birthday/anniversary campaign
  anniversary_date date,

  -- Staff-only notes (free-form)
  internal_notes text,

  -- Acquisition
  acquisition_source diner_acquisition_source,               -- typed enum (declared below); nullable for legacy + manual creation
  acquisition_restaurant_id uuid references restaurants(id) on delete set null,  -- which venue first acquired them

  -- Materialised aggregates (recomputed by job; see §6)
  visit_count integer not null default 0,
  covers_total integer not null default 0,                   -- sum of party_size across completed visits
  first_visited_at timestamptz,
  last_visited_at timestamptz,
  frequency_bucket varchar(20) not null default 'first_timer',  -- 'first_timer' | 'occasional' | 'regular' | 'lapsed' | 'dormant'
  typical_party_size_min integer,
  typical_party_size_max integer,
  no_show_count integer not null default 0,
  cancellation_count integer not null default 0,

  -- GDPR right-to-be-forgotten pseudonymisation (per foundations §15a.1)
  -- NOTE: retaining the row id is pseudonymisation, not anonymisation. We adopt the
  -- foundations-standard column name `redacted_at` (matches `erasure_log.redacted_at`).
  redacted_at timestamptz,                                    -- set when diner exercises forget-me; PII fields cleared

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint diners_identity_required check (phone is not null or email is not null)
);

-- Unique by phone within an org (when phone present and not pseudonymised)
create unique index diners_org_phone_unique
  on diners (organization_id, phone)
  where phone is not null and redacted_at is null;

-- Unique by email within an org — only enforced for email-only diners (no phone)
-- Rationale: shared inboxes (e.g., alice@desk.com used by spouses, assistants, family) are
-- common; the same email can legitimately belong to multiple humans. Phone is far more
-- uniquely person-bound, so it always wins as the dedup key when both are present.
create unique index diners_org_email_unique
  on diners (organization_id, lower(email))
  where email is not null and phone is null and redacted_at is null;

-- For org-wide search
create index diners_org_full_name on diners (organization_id, lower(full_name));
create index diners_org_phone on diners (organization_id, phone);
create index diners_frequency on diners (organization_id, frequency_bucket) where redacted_at is null;
create index diners_last_visited on diners (organization_id, last_visited_at desc) where redacted_at is null;
```

#### Identity decision matrix

| Booking carries | Match rule | Unique index that enforces it |
|---|---|---|
| phone only | strict unique per `(organization_id, phone)` | `diners_org_phone_unique` |
| email only (no phone) | strict unique per `(organization_id, lower(email))` | `diners_org_email_unique` |
| **both phone + email** | **phone wins for dedup**; email is captured on the matched row but is NOT used to look up | `diners_org_phone_unique` |
| neither | rejected at validation (`ValidationError('Phone or email required')`) | n/a |

**Rationale.** Phone (E.164) is the primary identity because it's near-uniquely person-bound. Email is the *secondary* identity, enforced unique only when phone is absent. Shared inboxes (`alice@desk.com`, `office@chain.com`, family-shared `gmail.com` accounts) are a real-world case where two different humans legitimately share an email — collapsing them on email alone would corrupt the diner record (mixed allergies, mixed consents, mixed history).

**Worked example.** A returning diner books with phone `+40712345678` + email `alice@desk.com`. Two months later her assistant Bob books with phone `+40798765432` + email `alice@desk.com` (the shared office inbox).

- Alice's booking matches by phone → existing diner row updated.
- Bob's booking misses on phone (different number) → no email lookup is attempted because phone was provided. A new diner row is created with Bob's phone + `alice@desk.com` as a secondary email.
- Result: two diner rows, each with their own visit history. Both carry the shared email; neither one "owns" it as a unique identity.

Counter-example: a walk-in form captured only `bob@desk.com` with no phone. That row gets caught by `diners_org_email_unique` against any prior email-only Bob row, dedup'd to one. The moment Bob later books with a phone, the row gets upgraded (phone added, email remains).

**Pseudonymisation.** The unique indices are partial: pseudonymised diners (`redacted_at is not null`) don't block re-acquisition under the same phone. See §8.2 + foundations §15a.1.

### 4.2 New column on `reservations`

```sql
alter table reservations
  add column diner_id uuid references diners(id) on delete set null;

create index reservations_diner on reservations (diner_id);
```

`on delete set null` — a deleted diner shouldn't cascade-delete historical reservations. The booking remains in history (de-personalised via pseudonymisation).

### 4.3 New column on `reviews`

```sql
alter table reviews
  add column diner_id uuid references diners(id) on delete set null;

create index reviews_diner on reviews (diner_id);
```

Lets us show "5 reviews by this diner across your venues" in Pro.

### 4.4 `diner_visits_view` — **DROPPED** (pre-release simplification)

Originally specified as a materialised view refreshed nightly. Per-diner-per-restaurant visit aggregates are queryable directly against `reservations` joined on `diner_id` — at v1 scale (≤100k reservations per org), this query runs <50ms. The view added a refresh dependency, a synchronisation window, and a bootstrapping concern (empty view on day 1). The `getDinerProfile` action does the aggregation inline. If query latency becomes a problem at v2 scale, revisit then.

### 4.5 RLS policies

```sql
alter table diners enable row level security;

-- Tavli admins: full access
create policy "diners_admin_all" on diners
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Org members (org_owner, org_admin, org_manager): read all diners in their org
create policy "diners_org_member_select" on diners
  for select using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and is_active = true
    )
  );

-- Org owners + admins: full write within their org
create policy "diners_org_admin_write" on diners
  for all using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
        and is_active = true
        and role in ('owner', 'admin')
    )
  );

-- Venue staff: read diners who have at least one reservation at their venue
create policy "diners_venue_staff_select" on diners
  for select using (
    exists (
      select 1
      from reservations r
      join restaurant_staff rs on rs.restaurant_id = r.restaurant_id
      where r.diner_id = diners.id
        and rs.user_id = auth.uid()
        and rs.is_active = true
    )
  );

-- Venue staff (any role): can edit notes, allergies, occasion tags on diners who have at least one reservation at their venue
-- but NOT phone, email, name (identity fields are stable; identity changes require an org-admin)
-- Enforce in application layer: the server action filters which columns this role can write.
create policy "diners_venue_staff_update_notes" on diners
  for update using (
    exists (
      select 1
      from reservations r
      join restaurant_staff rs on rs.restaurant_id = r.restaurant_id
      where r.diner_id = diners.id
        and rs.user_id = auth.uid()
        and rs.is_active = true
    )
  );
```

The venue-staff update policy is wide-open at the DB level (whole row). The narrowing to "notes + allergies + occasion tags only" happens in the application layer via the `can(...)` matrix and a column-allowlist in the server action. RLS guarantees no cross-org leakage; field-level authz is application-side.

## 5. APIs / interfaces

### 5.1 Diner lifecycle

| Action | File | Permissions | Notes |
|---|---|---|---|
| `findOrCreateDinerForReservation` | new internal at `src/lib/diners/upsert.ts` | called from `createReservation` only | Atomic upsert by `(organization_id, phone)` or `(organization_id, email)` fallback. |
| `createDiner` | new at `src/app/partner/(dashboard)/diners/actions.ts` | `can('staff.invite.venue')` minimum (any venue staff at the relevant venue can add) | Manual add (walk-in capture). |
| `updateDinerProfile` | same | venue staff can update notes/allergies/occasions; org admin can update identity (phone/email/name) | Column allowlist per role. |
| `mergeDiners` | new at `src/app/partner/(dashboard)/diners/actions.ts` | org admin | Manual dedup tool. Moves all reservations + reviews from source → target; deletes source. Audit logged. |
| `splitDiner` | same | org admin | Manual undo for accidental merges. Splits one diner into two by selecting which reservations move. Audit logged. |
| `pseudonymiseDiner` | new at `src/lib/diners/pseudonymise.ts` | tavli admin + GDPR flow | Sets `redacted_at`, clears PII columns (phone, email, name, notes); writes `erasure_log` row per foundations §15a.1. Reservation history preserved but de-personalised. |
| `searchDiners` | new at `src/app/partner/(dashboard)/diners/actions.ts` | org member (any role) | Cross-venue search by name/phone/email. Returns filtered to venues the caller can access. |
| `getDinerProfile` | same | org member or venue staff | Returns the diner + visit history scoped to caller's accessible venues. |

### 5.2 The upsert is the heart of this domain

`findOrCreateDinerForReservation(input)` runs inside the same transaction as `createReservation`. Algorithm:

```ts
async function findOrCreateDinerForReservation({
  organizationId,
  restaurantId,
  guestName,
  guestPhone,        // already validated, raw input
  guestEmail,
  locale,
  acquisitionSource,
}): Promise<{ dinerId: string; isNew: boolean }> {

  // Phone normalisation defaults to the restaurant's country, NOT a hardcoded 'RO'.
  // The restaurant's city resolves to a country_code via the existing `cities` table.
  // Without this, a TR-based restaurant's diners would have their phones parsed as RO.
  const restaurantCountry = await loadRestaurantCountryCode(restaurantId)   // e.g., 'RO' | 'TR'
  const phoneE164 = parsePhoneE164(guestPhone, defaultCountry=restaurantCountry)
  if (!phoneE164 && !guestEmail) {
    throw new ValidationError('Phone or email required')
  }

  // Phone-first path — single round-trip insert-or-fetch (no manual retry loop)
  if (phoneE164) {
    // INSERT ... ON CONFLICT DO NOTHING RETURNING — atomic against the partial unique
    // index `diners_org_phone_unique`. If we won the race, we get the new row back;
    // if a concurrent insert beat us, RETURNING is empty and we SELECT the winner.
    const inserted = await db
      .insert(diners)
      .values({
        organizationId,
        phone: phoneE164,
        phoneRaw: guestPhone,
        email: guestEmail?.toLowerCase(),
        fullName: guestName,
        locale,
        acquisitionSource,
        acquisitionRestaurantId: restaurantId,
      })
      .onConflictDoNothing({ target: [diners.organizationId, diners.phone] })
      .returning({ id: diners.id })

    if (inserted.length === 1) {
      return { dinerId: inserted[0].id, isNew: true }
    }

    // RETURNING was empty — another tx inserted concurrently OR the row already existed.
    // One SELECT to fetch the winner.
    const existing = await db.query.diners.findFirst({
      where: and(
        eq(diners.organizationId, organizationId),
        eq(diners.phone, phoneE164),
        isNull(diners.redactedAt),
      ),
    })

    if (!existing) {
      // Structurally impossible in practice: conflict must have come from this index
      // and the row must therefore exist. If it doesn't, something has gone wrong.
      return fail('internal', 'diner upsert: conflict without a visible row')
    }

    // Update soft fields if newer info is available.
    if (existing.fullName !== guestName && guestName) {
      await db.update(diners).set({ fullName: guestName }).where(eq(diners.id, existing.id))
    }
    if (existing.email == null && guestEmail) {
      await db.update(diners).set({ email: guestEmail.toLowerCase() }).where(eq(diners.id, existing.id))
    }
    return { dinerId: existing.id, isNew: false }
  }

  // Email-only path (no phone provided) — same ON CONFLICT pattern against
  // `diners_org_email_unique` (partial: phone is null).
  if (!phoneE164 && guestEmail) {
    const inserted = await db
      .insert(diners)
      .values({
        organizationId,
        phone: null,
        email: guestEmail.toLowerCase(),
        fullName: guestName,
        locale,
        acquisitionSource,
        acquisitionRestaurantId: restaurantId,
      })
      .onConflictDoNothing()  // partial unique index handles the conflict target
      .returning({ id: diners.id })

    if (inserted.length === 1) {
      return { dinerId: inserted[0].id, isNew: true }
    }

    const existing = await db.query.diners.findFirst({
      where: and(
        eq(diners.organizationId, organizationId),
        eq(sql`lower(${diners.email})`, guestEmail.toLowerCase()),
        isNull(diners.phone),
        isNull(diners.redactedAt),
      ),
    })
    if (!existing) {
      return fail('internal', 'diner upsert: email conflict without a visible row')
    }
    return { dinerId: existing.id, isNew: false }
  }

  // Defensive: validation above should have rejected this.
  return fail('validation', 'phone or email required')
}
```

**Race semantics.** Two simultaneous bookings from the same phone in the same org are handled by a single DB round-trip: `INSERT ... ON CONFLICT (organization_id, phone) DO NOTHING RETURNING id`. If RETURNING returns a row, we won the race (new diner). If RETURNING is empty, a concurrent transaction won — we do one follow-up `SELECT` and return that row. No application-side retry loop, no manual `23505` handling.

### 5.3 Merge / split semantics

`mergeDiners(sourceId, targetId)`:
1. **Verify both belong to the same `organization_id`** — load both rows in one query; if `source.organization_id !== target.organization_id`, return `fail('invalid_input', 'cross-org merge not permitted', { sourceId: source.organization_id, targetId: target.organization_id })`. This is also a foundations §15a.1 cross-org isolation check; the RLS policy would deny the read anyway, but the explicit check produces a clearer error message.
2. Update all `reservations.diner_id = sourceId` → `targetId`.
3. Update all `reviews.diner_id = sourceId` → `targetId`.
4. Merge profile fields: arrays union (`allergies`, `occasion_tags`, `dietary_preferences`); JSON merge (`seating_preferences`); take longer `internal_notes`; keep target's identity (phone/email/name).
5. Audit-log `AUDIT.diner.merged` with payload `{ source_diner_id, target_diner_id, merged_field_values?: { allergies, occasion_tags, dietary_preferences, seating_preferences, internal_notes } }`. The `merged_field_values` snapshot captures the source row's final state so a future split or audit can reconstruct what came from where.
6. Delete `sourceId`.
7. Enqueue `diner.recompute-aggregates` for `targetId`.

`splitDiner` — concrete API:

```ts
export async function splitDiner(input: {
  sourceId: string                   // the existing diner to split FROM
  reservationIds: string[]           // reservations to move OUT of sourceId (must all currently link to sourceId)
  newDiner: {                        // the new identity — REQUIRED at split time so the unique index is satisfied at insert
    fullName: string                 // typically "Split of <source> — pending edit" by default, but staff can prefill
    phone?: string                   // E.164; cannot equal sourceId.phone (uniqueness within org)
    email?: string                   // cannot equal sourceId.email when newDiner.phone is null
  }                                  // at least one of phone or email required (`diners_identity_required` check)
}): Promise<ActionResult<{ newDinerId: string }>>
```

**Why split requires the new identity up front** (not "edit after insert"): the partial unique index `diners_org_phone_unique` enforces `(organization_id, phone)` uniqueness at INSERT time. We cannot create a new diner row that duplicates the source's phone; the INSERT itself would fail with `23505`. The UI therefore presents a two-column form ("Diner A keeps:" / "Diner B (new) gets:") before submitting — staff explicitly assigns identity to each side before either row mutates.

Behaviour:
1. Verify all `reservationIds` currently belong to `sourceId` and the same `organization_id`. On mismatch → `fail('invalid_input')` with the bad ids in `fields`.
2. Validate `newDiner.phone` (if present) is E.164 and ≠ `sourceId.phone`. Validate `newDiner.email` similarly.
3. **Single Drizzle transaction:** INSERT the new diner row with the explicit `newDiner` identity (now unique); UPDATE `reservations.diner_id` for the moved set; UPDATE `reviews.diner_id` for any reviews whose `reservation_id` is in the moved set; commit.
4. Audit-log `AUDIT.diner.split` with `{ source_diner_id, new_diner_id, moved_reservation_ids }`.
5. Enqueue `diner.recompute-aggregates` for both `sourceId` and `newDinerId`.
6. Return `{ newDinerId }` so the UI can route to the new profile.

If the staff cannot decide identity assignments at split time, they cancel — the operation is all-or-nothing. There's no "intermediate split state" to clean up.

### 5.4 Search API

`searchDiners({ orgId, query, limit?, offset? })`:
- Case-insensitive trigram match on `full_name`, `phone`, `email`.
- Phone search auto-normalises the query.
- Returns: id, full_name, phone (last 4 visible — see privacy below), email (masked), visit_count, last_visited_at, frequency_bucket.
- Scoped to venues the caller has access to: if they only see venue A, results are filtered to diners with at least one reservation at venue A.

### 5.5 Privacy: phone + email masking in lists

Default rendering in list views:
- Phone: `+40 7•• ••• •89` (country + first digit + last 2).
- Email: `m•••e@gmail.com`.

Full PII reveals on the detail page only, logged to `diner_pii_access_log` (new table — see §8). This is a privacy-by-design control mandated for ANPC defensibility.

#### Operations that write a `diner_pii_access_log` row

| Operation | Logged? | Why |
|---|---|---|
| Reveal-button click on diner list or detail page (unmasks one field) | yes (`access_kind = 'reveal'`) | Active staff action; one row per field per click. |
| Export (CSV / XLSX) from list or detail | yes (`access_kind = 'export'`) | One row per diner in the export. |
| Any server action that writes PII (`updateDinerProfile` on phone/email/name, `mergeDiners`, `splitDiner`, manual notes edit) | yes (`access_kind = 'edit'` / `'merge'`) | Mutation implies read. |
| **Bulk-read API returning unmasked PII** (`revealPiiBatch` wrapper used by exports, segment previews, marketing list builders) | yes — **one row per diner**, written in a single batched insert before the wrapper returns | Without this, a single bulk-read could exfiltrate 10k records with one audit entry. |
| Read-only display of masked data in lists | NO | Mask = not-revealed. Logging every paginated list view would dwarf the useful signal and obscure the actual reveals. |
| Read-only display in the inline diner panel (allergies + visit count, no phone/email) | NO | Operational kitchen necessity; not a PII surface. |

```ts
// src/lib/diners/reveal-pii-batch.ts
// Wraps any bulk read that returns unmasked phone/email/name. Writes N audit rows
// (one per diner) atomically in a single INSERT before returning the data.
export async function revealPiiBatch<T>(input: {
  dinerIds: string[]
  actor: { userId: string; orgIds: string[] }
  accessKind: 'export' | 'reveal' | 'segment_preview'
  surface: string
  loader: (ids: string[]) => Promise<T[]>
}): Promise<T[]> { /* ... */ }
```

### 5.6 Cross-org GDPR isolation mechanism

The diner table is scoped per `organization_id`. Cross-org leakage is prevented at three layers — each enforced independently so a bug in one is caught by the others.

1. **RLS (foundations §4.4).** Every SELECT, UPDATE, DELETE policy on `diners`, `reservations`, `reviews`, `diner_pii_access_log` requires the caller's session to be a member of the row's `organization_id`. The default policy is deny.

2. **Repo-layer scope guard.** Every cross-org query in the repo API uses an explicit `where organization_id in (...)` clause where the right-hand side is the caller's *verified* org-membership set (loaded from `organization_members` for the current session). A development-time assertion helper:
   ```ts
   // src/lib/diners/scope-guard.ts
   export function assertOrgScope<Q extends DrizzleQuery>(
     query: Q,
     sessionOrgIds: string[],
   ): Q {
     // Dev-/test-only guard. When NODE_ENV !== 'production':
     //   throws if the query lacks an `organization_id in (...)` clause narrower than
     //   the full set, OR if the clause references org ids outside sessionOrgIds.
     // In production: returns the query unchanged (zero overhead). The runtime
     // protection comes from RLS (layer 1) + the code-review discipline (layer 3),
     // not from this helper. Its job is to fail CI when a developer forgets to scope.
   }
   ```
   Every repo method has a test that demonstrates the guard fires on a hostile (un-scoped) call. RLS catches the same class of bug at the DB layer in production.

3. **No cross-org joins by phone in the standard repo API.** There is no `findDinersByPhoneAcrossOrgs` function. The only way to perform such a join is the privacy-team operational query at `privacy@tavli.ro` (manual, audit-logged, requires Tavli-admin role + ticket reference) — see open question 9 + §13.

Cross-org leakage is therefore a defence-in-depth problem: an attacker would need to bypass RLS (DB-level), forge an `organization_members` row (auth-level), and use an unsanctioned repo helper (code-review-level) simultaneously.

## 6. UI surfaces

### 6.1 Per-diner detail page

Route: `/partner/diners/[id]`.

Sections:
- **Header**: full_name, phone (masked-by-default with reveal button), email (same), frequency_bucket, last_visited_at, total visits across accessible venues.
- **Profile**: allergies (chip editor), occasion_tags (chip editor), dietary_preferences, seating_preferences (key-value editor), locale.
- **Visit history**: chronological list of `reservations` for this diner across all accessible venues. Each row shows date, time, restaurant, party_size, status, notes from that visit.
- **Reviews**: list of `reviews` from this diner.
- **Notes**: staff-facing free-text editor.
- **Marketing reachability** *(read from §11)*: which channels they've opted into, last campaign received, frequency-cap consumption.
- **Actions**: merge with another diner (org admin), split, request pseudonymisation (GDPR — fires §13 flow), download data (GDPR — full export).

### 6.2 Diner list / search

Route: `/partner/diners`.

- Search bar at top (name / phone / email).
- Filter chips: frequency_bucket, has_email, has_phone, acquisition_source, opted_into_marketing, last_visited_within (7d / 30d / 90d / 1y).
- Sort: last_visited (default), visit_count desc, alphabetical.
- Pagination: 50 per page, server-side.
- Bulk actions: add to segment (when §11 lands), export selected to CSV.

### 6.3 Inline diner panel in reservation detail sheet

When a staff member opens a reservation, the right side of the sheet shows the linked diner:
- Visit count + last visit
- Allergies (always visible — operational necessity for the kitchen)
- Notes
- "View full profile" → §6.1

### 6.4 Booking-form integration

When a staff member starts creating a reservation in the partner portal, after they type a phone number, lazy-search `diners` by partial phone. If matched, autofill name + email + show "Returning diner — last visit X days ago." Reduces double-entry and increases recognition.

## 7. Background jobs

Per `00-foundations.md` §10 (pg-boss substrate).

| Job key | Schedule / trigger | Idempotency | Purpose |
|---|---|---|---|
| `diner.recompute-aggregates` | per-diner: on every reservation status change to/from `completed`, `no_show`, `cancelled` | Idempotent: recomputes from `reservations` table. | Refresh `visit_count`, `covers_total`, `first_visited_at`, `last_visited_at`, `frequency_bucket`, `typical_party_size_*`, `no_show_count`, `cancellation_count`. |
| `diner.refresh-visits-view` | **DROPPED** (per §4.4 simplification — view was deleted) | — | — |
| `diner.frequency-bucket-rebalance` | nightly 04:00 | Idempotent. | Diners not visited in 90 days → `lapsed`. Not visited in 180 days → `dormant`. Newly visited → recompute. |
| `diner.purge-pseudonymised` | nightly 05:00 | Idempotent. | Diners with `redacted_at < now() - interval '30 days'` get hard-deleted (the GDPR reversibility window per foundations §15a.1). The reservation rows survive (with `diner_id = null`). |
| `diner_pii_access_log.purge-old` | nightly 05:30 | Idempotent. | Rows older than 24 months (ANPC + GDPR audit-log retention floor) are hard-deleted. Cross-domain naming under §13's retention-policy umbrella but written here because the table is owned by this domain. |

`frequency_bucket` definitions (configurable per org in v1.5; hardcoded thresholds in v1):
- `first_timer`: ≤ 1 completed visit
- `occasional`: 2–4 completed visits within 12 months
- `regular`: ≥ 5 completed visits within 12 months
- `lapsed`: previously visited but no completed visit in 90 days
- `dormant`: no completed visit in 180 days

## 8. Compliance & audit hooks

PII access in this domain is the most exposed in the platform — a staff member viewing 100 diner profiles touches 100 records of personal data. The audit substrate has to record it.

### 8.1 New table: `diner_pii_access_log`

```sql
create table diner_pii_access_log (
  id uuid primary key default gen_random_uuid(),
  diner_id uuid not null references diners(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  accessed_by_user_id uuid not null references auth.users(id),
  accessed_field varchar(40) not null,                       -- 'phone' | 'email' | 'full_name' | 'notes' | 'allergies' | etc.
  access_kind varchar(20) not null,                          -- 'reveal' | 'export' | 'edit' | 'merge'
  surface varchar(40),                                        -- 'detail_page' | 'list_search' | 'reservation_sheet' | 'export'
  context_reservation_id uuid references reservations(id),    -- if access happened in a reservation context
  accessed_at timestamptz not null default now()
);

create index diner_pii_access_log_diner on diner_pii_access_log (diner_id, accessed_at desc);
create index diner_pii_access_log_actor on diner_pii_access_log (accessed_by_user_id, accessed_at desc);
```

Written by an application-layer middleware around any server action that reveals masked PII or exports a diner's data. Not written for masked-list reads (too noisy — those are not PII reveals).

Retention: kept for 24 months minimum (ANPC + GDPR audit window). Older rows purged by a separate cleanup job in §13.

### 8.2 Right-to-be-forgotten flow (GDPR pseudonymisation, not anonymisation)

**Terminology.** Per GDPR Art 4(1) + foundations §15a.1, retaining a row id (so reservation history can keep referring to "diner X" without re-identifying a human) is **pseudonymisation**, not anonymisation. We use the GDPR-correct verb throughout. (Per foundations §15a.1: erasure is **never** an in-place regex over text columns — we null specific PII columns + write an `erasure_log` row.)

When a diner requests deletion (via `/reservations/[token]/delete-my-data` or by writing to `privacy@tavli.ro`):

1. Org admin (or Tavli admin) opens the diner profile.
2. Clicks "Pseudonymise this diner."
3. Server action `pseudonymiseDiner(dinerId, reason)`:
   - Sets `redacted_at = now()`.
   - Clears specific PII columns (null, never regex over free text): phone, phone_raw, email, full_name, internal_notes.
   - Clears: allergies, occasion_tags, seating_preferences, dietary_preferences (these are PII when tied to identifiable individuals — once severed, retention may be argued separately, but conservatively wipe).
   - Keeps: visit_count aggregates (aggregate data, not PII).
   - Reservations remain: their `guest_name`, `guest_phone`, `guest_email` columns are also nulled per §02 right-to-be-forgotten (column-targeted, not regex).
   - Reviews remain: `first_name` nulled.
   - Writes an `erasure_log` row per foundations §15a.1 (`subject_type='diner'`, `subject_id=dinerId`, `reason`, `actor_user_id`, `redacted_columns[]`).
   - Audit log entry: `diner.pseudonymised` with actor + reason.
4. `diner.purge-pseudonymised` job hard-deletes the row 30 days later (the GDPR reversibility window — see retention rule below).

**Retention rule.** Pseudonymised rows are hard-deleted 30 days after `redacted_at` — matching foundations §15a.1 exactly. The 30-day window exists so an accidental pseudonymisation can be reversed via tavli-admin restore (audit-logged). Beyond 30 days the data is unrecoverable. This window is the industry-standard self-service-erasure SLA: well within GDPR Art 17 "without undue delay" while still allowing a recovery path for staff mistakes.

### 8.3 Cross-domain audit-log events

Per foundations §16.2, every server action in this domain writes an `audit_logs` row via `recordAudit()`. The `diner_pii_access_log` (§8.1) is the domain-specific PII-access trail; `audit_logs` is the cross-domain mutation trail. Both are written; they serve different audiences (PII auditor vs. operations).

| Server action | `AUDIT.*` key | Subject | Notable context |
|---|---|---|---|
| `findOrCreateDinerForReservation` (new diner branch) | `AUDIT.diner.pii_accessed` only when actor is staff + diner is created via the partner portal; not logged for anonymous public bookings (covered by `AUDIT.reservation.created`) | new diner | `{ source: acquisition_source, restaurant_id }` |
| `createDiner` (manual add) | implicit via the reservation/diner pair; specifically `AUDIT.diner.pii_accessed` with `access_kind='edit'` | new diner | actor + restaurant_id |
| `updateDinerProfile` | `AUDIT.diner.pii_accessed` (`access_kind='edit'`) when identity fields change; no audit_log row for purely operational fields (allergies/notes) | target diner | `{ changed_fields: [...] }` (no before/after values to avoid PII) |
| `mergeDiners` | `AUDIT.diner.merged` | target diner | `{ source_diner_id, target_diner_id, merged_field_keys }` |
| `splitDiner` | `AUDIT.diner.split` | source diner | `{ source_diner_id, new_diner_id, moved_reservation_count }` |
| `pseudonymiseDiner` | `AUDIT.diner.pseudonymised` + per-table `AUDIT.compliance.erasure_executed` | target diner | `{ reason, redacted_columns }` + `erasure_log_id` |
| `exportDinerData` | `AUDIT.compliance.dsar_exported` | target diner | `{ scope: 'self' \| 'admin_on_behalf', signed_url_expires_at }` |

The two existing AUDIT registry entries used here (`diner.split`, `diner.pseudonymised`) are already in foundations §16.2; no new registry entries required.

### 8.4 Data export (GDPR right-to-portability)

`exportDinerData(dinerId)`:
- Returns a ZIP containing: `diner.json` (the profile), `reservations.csv` (every booking), `reviews.csv`, `consents.json` (from §11), `marketing_history.csv` (from §11).
- Signed S3 URL with 24h expiry.
- Audit log: `diner.exported`.

Available to: the diner themselves (via `/reservations/[token]/export-my-data`), org admins (on behalf), Tavli admins.

## 9. Build sequence

Ordered, PR-sized. Most items are sequential because the table lands before the upsert lands before the UI lands.

_Note: two earlier steps were dropped pre-release (a historical-reservation backfill and the materialised `diner_visits_view`). The numbering below is consecutive from 1; the drops are visible in §2 (no backfill) and §4.4 (dropped view)._

1. **`diners` table + `diner_acquisition_source` enum + RLS + indices + migration.** *(1 day)*
2. **`reservations.diner_id` + `reviews.diner_id` + indices.** *(0.3 day)*
3. **`findOrCreateDinerForReservation` upsert + integrate into `createReservation`.** Phone normalisation via `libphonenumber-js` with restaurant-country default. *(1.5 days)*
4. **`diner_pii_access_log` table + `revealPiiBatch` helper.** *(0.5 day)*
5. **Recompute-aggregates job** with app-level hook on reservation status change (no DB trigger per foundations §4.3). *(1 day)*
6. **Frequency-bucket-rebalance nightly job.** *(0.5 day)*
7. **`getDinerProfile` + visit-history aggregation server action** (inline; no materialised view per §4.4). *(0.5 day)*
8. **`searchDiners` + `pg_trgm` extension + trigram indices.** *(1 day)*
9. **Diner detail page (`/partner/diners/[id]`)** with all six sections (header / profile / visit history / reviews / notes / actions). *(2 days)*
10. **Diner list / search page (`/partner/diners`)** with filter chips + bulk select. *(1.5 days)*
11. **Inline diner panel in reservation detail sheet** (cross-doc with §02). *(0.5 day)*
12. **Booking-form autofill on phone match** (partner portal staff create-booking flow). *(0.5 day)*
13. **`mergeDiners` + `splitDiner`** + UI under "duplicate suspects" admin tool (two-column identity form per §5.3). *(1.5 days)*
14. **`pseudonymiseDiner` + purge-pseudonymised job (30-day retention) + UI button on detail page + `erasure_log` write.** *(1 day)*
15. **`exportDinerData` + signed-URL download.** *(0.5 day)*
16. **PII masking helpers** (`maskPhone`, `maskEmail`) + audit-log middleware. *(0.5 day)*

**Total: ~12–13 working days.** The riskiest items are step 3 (upsert correctness against the partial unique indices + concurrent-insert race) and step 13 (`splitDiner` two-column identity form is the trickiest UX). Both deserve their own dedicated test fixture suite.

Dependencies: steps 1–3 must land before any other domain that wants to read `reservations.diner_id` (§02 modify flow, §07 analytics, §11 marketing segmentation). Steps 4–16 can parallelise after that anchor.

## 10. Open questions

1. **Should we attempt cross-org phone normalisation for analytics?** I.e., recognise that a diner who books at two unrelated chains is the same human (for Tavli-internal LTV math). Recommendation: no for v1. The legal complexity isn't worth the analytical gain at our scale. Revisit when we have >100 orgs.

2. **Should walk-in diners (no reservation) get a diner row?** Spec doesn't require it, but staff manually creating a diner without booking would be useful for loyalty. Recommendation: yes — `createDiner` action supports it. Acquisition source `'walk_in'` or `'manual'`.

3. **Should aggregates be triggered (real-time) or batched?** Trigger gives accurate live segmentation; batch is cheaper. Recommendation: app-level hook on `reservations` status mutations writes aggregates synchronously. Nightly job acts as a reconciliation safety net.

4. **What happens to a diner's record when their parent organisation deletes (e.g., chain shuts down)?** Recommendation: cascade delete. The org owned the data; if they leave, it goes. Caveat: the diner themselves may want a copy — handle via the data-export flow at offboarding (§12 + §13).

5. **Phone number country defaults — what if a tourist books from a non-RO phone?** `libphonenumber-js` parses without a default country if the phone is in E.164 format (starts with `+`). For inputs without a `+`, the default country is **the restaurant's country** (resolved from `restaurants.city_id → cities.country_code`), not a hardcoded `'RO'`. This matters because Tavli operates across multiple locales: RO (primary), TR (existing — `cities` table has Istanbul), and the trilingual roadmap explicitly includes DE + AT. A TR restaurant's diners entering local-format phones would otherwise parse as Romanian — completely wrong. The same risk applies for a Vienna restaurant: a `0664…` Austrian local-format number must default-parse with country `'AT'`, not `'RO'`. Bad parses get logged + flagged; the diner is created without a normalised phone (still searchable by raw).

6. **Should we support diner-self-managed profiles in the future (the diner logs in and updates their own allergies)?** Speculative; v2 at earliest. Today the partner side is the system of record.

7. **Multi-language allergy/occasion tags?** Recommendation: store the canonical key in English (`'nuts'`, `'gluten'`); the i18n catalogue resolves to the display string per locale. Avoids drift.

8. **Should `internal_notes` be diner-level (current design) or visit-level (per-reservation)?** Recommendation: both. Diner-level for stable preferences ("always wants window table"); visit-level on `reservations.notes` already exists for visit-specific context. Document the difference in the UI.

9. **GDPR: when a diner pseudonymises at org A, should it propagate to org B if it's the same person?** No — cross-org is invisible by design. Each org has its own deletion obligation, exercised separately. If a diner wants total deletion across Tavli, they email `privacy@tavli.ro` and Tavli admin runs a phone-match query across orgs (logged with a ticket reference per §5.6).

10. **Trigram search performance at scale**: pg_trgm is fine up to ~1M rows per org. Recommendation: enable pg_trgm extension; reassess at 500k diners per org (unlikely before v2).

## 11. Cross-references

- **§00 Foundations** — pg-boss for aggregate-refresh + nightly jobs; pg_trgm extension; libphonenumber-js dependency.
- **§01 Identity & accounts** — `organization_id` scoping defined there; `can()` gates every diner action.
- **§02 Bookings** — `createReservation` calls `findOrCreateDinerForReservation`; reservation detail sheet renders the diner panel.
- **§04 Diner communication** — sends transactional email/SMS to a diner; reads `diners.locale` to pick the language.
- **§06 Reviews** — `reviews.diner_id` lets us show a diner's review history.
- **§07 Analytics & reports** — visit history aggregates per diner; channel attribution per acquisition source.
- **§09 Multi-location** — per-venue diner visibility is the natural read; the diner record itself sits at org scope, so the multi-location aggregation is a SELECT not a JOIN.
- **§10 Corporate events** — corporate bookings still link to a diner; same upsert path, different `acquisition_source = 'corporate'`.
- **§11 Marketing suite** — segmentation reads `frequency_bucket`, `last_visited_at`, `acquisition_source`, `occasion_tags`, `typical_party_size_*`. **Marketing consent** lives in the `marketing_consents` foundation table (§00 §4.7), keyed off `(organization_id, diner_id, channel)`. **Suppressions** live in `marketing_suppressions` (§00 §4.7). §11 reads both; this domain writes them when a diner opts in via the booking form.
- **§13 Compliance & legal** — owns the GDPR right-to-be-forgotten orchestration; this doc owns the diner-side mechanics; `diner_pii_access_log` rolls into the compliance reporting in §13.

---

*Last updated: 2026-05-20. This is the highest-leverage greenfield domain in the spec — every Pro tier feature reads from it.*
