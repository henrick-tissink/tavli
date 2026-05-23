# Wave 5 sub-unit A — §09 multi-location substrate (design)

> Ship the schema + venue counter + venue-lifecycle actions that §12's
> per-additional-location billing math depends on. Forward-declare the
> billing seam so Wave 5 sub-unit F (§12 mutations) wires it in without
> a refactor. **No UX surfaces** — those §09 §6 components (org dashboard,
> venue switcher, add-venue wizard, rollup analytics, cross-venue search)
> are deferred to a later wave; they are not in the Wave 5 build-order.

**Date:** 2026-05-24
**Build-order lines covered (Wave 5):**
- §09 `organizations.brand_primary` / `brand_secondary` columns
- §09 `restaurants.archived_at` rollup + venue archival flow

**Source architecture:** `docs/superpowers/architecture/09-multi-location.md`
§3.1, §4.1, §4.1a, §4.2, §4.3, §5.1, §5.2, §5.3, §10.1.

---

## 1. Scope

### In scope

1. **Migration 0040** (next free number; prod-apply gated on the still-pending
   0033–0039 batch per MEMORY):
   - `organizations` += `max_venues` (nullable int), `current_venue_count`
     (int not null default 0), `brand_primary` (varchar(7)), `brand_secondary`
     (varchar(7)).
   - `restaurants` += `archived_at` (timestamptz, nullable) — the canonical
     "is this venue active" marker (§4.1a: `archived_at is null` = live;
     **`is_active` does not exist as a column**).
   - New table `venue_addition_log` + index + RLS (org-admin SELECT;
     service-role-only INSERT).
2. **Server actions** in `src/app/partner/org/[orgId]/venues/actions.ts`:
   - `addVenueToOrg`
   - `removeVenueFromOrg`
   - `reactivateVenue`
   Each maintains `organizations.current_venue_count` inside one
   `db.transaction`, writes a `venue_addition_log` row, emits
   `AUDIT.organization.updated`, and calls the billing hook (no-op for now).
3. **Billing-hook seam** `src/lib/billing/venue-hooks.ts` — forward-declared
   `onVenueAdded` / `onVenueRemoved` async no-ops. W5-F implements
   `syncExtraLocationQuantity` behind these.
4. **Nightly reconcile job** `multi_location.reconcile-venue-count`
   (§10.1) — the counter drift backstop ("rollup" in the build-order).
   New `JOBS.multiLocation` namespace in `src/lib/jobs/keys.ts`.

### Explicitly out of scope (deferred — not in Wave 5 build-order)

- Org dashboard (`/partner/org/[orgId]`), venue switcher nav, add-venue
  multi-step UI, venue list management page (§09 §6).
- `switchActiveVenueContext` + `tavli_active_venue` cookie + middleware (§5.4).
- Org-rollup analytics view + cross-venue search defaults (§6.5, §8) — depend
  on §07 (Wave 6).
- "New venue added" operator email (§5.1 step 11) — no §04 template; not
  load-bearing. Deferred.
- Onboarding-wizard redirect (§5.1 step 13) — the action returns
  `restaurant_id`; routing is the (future) caller's concern.
- `org_status` enum `'archived'` value — owned by the §12 lifecycle waves
  (archive-cancelled-orgs job, W5-G); not needed by §09 archival, which uses
  `restaurants.archived_at`.

## 2. Data model

### 2.1 `organizations` new columns (§4.1)

```sql
alter table organizations
  add column max_venues integer,
  add column current_venue_count integer not null default 0,
  add column brand_primary varchar(7),
  add column brand_secondary varchar(7);
```

- `max_venues` — nullable; `null` = enforce tier rules in app code
  (Base = 1, Pro = unlimited with billing on >3). Tavli-admin override for
  negotiated chains.
- `current_venue_count` — denormalised cache, **app-managed** (NOT a trigger,
  per foundations §4.3). Billing math reads it on every Stripe webhook.
- `brand_primary` / `brand_secondary` — org-level brand-colour defaults; a
  venue may override via `restaurants.brand_*` (added later by §05); the venue
  page renders `coalesce(restaurants.brand_primary, organizations.brand_primary)`.
  This sub-unit adds the **org-level** columns only.

**Backfill:** set `current_venue_count` for existing orgs to
`count(restaurants where organization_id = org.id and archived_at is null)`
in the same migration, so the counter starts correct rather than at 0.

### 2.2 `restaurants` new column (§4.1a)

```sql
alter table restaurants
  add column archived_at timestamptz;
```

All "active venue" queries across all domains filter `where archived_at is null`.
Re-activation sets `archived_at = null`. Matches the §08 `restaurant_tables.archived_at`
soft-delete convention exactly.

**Note on existing active-venue queries:** this sub-unit adds the column but
does NOT retrofit every existing `restaurants` query with `archived_at is null`.
A grep audit identifies hot read paths (venue lists, the diner-facing venue
directory) and adds the filter where archival must hide a venue. Audit-only
paths are left as-is. The audit + targeted filtering is a task in the plan.

### 2.3 `venue_addition_log` (§4.2)

```sql
create table venue_addition_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  action varchar(20) not null,                 -- 'added' | 'removed' | 'reactivated'
  by_user_id uuid references auth.users(id) on delete set null,
  venue_count_after integer not null,
  billing_impact_cents integer,                -- per-month delta; set by §12 later, null now
  stripe_subscription_item_id varchar(80),     -- set by §12 webhook later, null now
  created_at timestamptz not null default now()
);

create index venue_addition_log_org on venue_addition_log (organization_id, created_at desc);

alter table venue_addition_log enable row level security;

create policy "venue_addition_log_org_admin_read" on venue_addition_log
  for select using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and is_active = true and role in ('owner', 'admin')
    )
  );
-- INSERT is service-role only (the venue actions run with the admin client).
```

`billing_impact_cents` + `stripe_subscription_item_id` are written `null` in
this sub-unit; §12 (W5-F) backfills them when the billing hook becomes real.

Drizzle schema additions mirror the above in `src/lib/db/schema.ts`.

## 3. The app-managed counter (§4.3)

The counter mutation MUST run inside the same `db.transaction` as the
`restaurants` insert/archive — never two separate statements (a crash between
them drifts billing math until the nightly reconcile catches it):

```ts
await db.transaction(async (tx) => {
  await tx.insert(restaurants).values({ organizationId, ... });
  await tx.update(organizations)
    .set({ currentVenueCount: sql`current_venue_count + 1` })
    .where(eq(organizations.id, orgId));
  await tx.insert(venueAdditionLog).values({ ...action: 'added', venueCountAfter });
});
```

`venueCountAfter` is read back inside the transaction (or computed as
`current_venue_count + 1` via a `returning()` on the counter update) so the
log row records the post-mutation count consistently.

## 4. Server actions

File: `src/app/partner/org/[orgId]/venues/actions.ts`. All return
`ActionResult<T>` (foundations §3.2) — never throw to clients. Built with the
project's `make*({ deps })` dependency-injection pattern so tests inject fakes.

### 4.1 `addVenueToOrg(input): ActionResult<{ restaurant_id: string }>`

1. `requireCan(session, 'org.add_venue', { kind: 'organization', id: orgId })`
   (already in the matrix: `org_owner`, `org_admin`).
2. Zod-validate input (name, cityId, address, optional details).
3. **Tier gate:** `loadActiveSubscription(orgId)` (injected dep). If
   `tier === 'base'` → reject `TV701` (`multi_venue_upgrade_required`, already
   defined) with an upgrade CTA. *Note: the live stub returns `base` for every
   org until W5-B, so this gate blocks real multi-venue adds until then; tests
   inject a `pro` fake to exercise the happy path.*
4. **`max_venues` cap:** if set and `current_venue_count >= max_venues` → reject
   with a typed error (`TV702` `venue_cap_reached`, new — see §6).
5. Inside one `db.transaction`:
   - insert `restaurants` (organization_id, status `'draft'`, `archived_at` null);
   - insert `restaurant_staff` owner row for the actor;
   - increment `current_venue_count`;
   - insert `venue_addition_log` (`action: 'added'`, `venue_count_after`).
6. Commit.
7. After commit: `await billingHooks.onVenueAdded({ orgId, restaurantId })`
   (no-op now). Failure → Sentry; does NOT roll back the venue.
8. `AUDIT.organization.updated`, `context: { event: 'venue_added', restaurant_id, venue_count_after }`.
9. Return `{ restaurant_id }`.

(Email + onboarding redirect deferred per §1.)

### 4.2 `removeVenueFromOrg({ restaurantId, reason }): ActionResult`

1. `requireCan(session, 'restaurant.delete', { kind: 'restaurant', id, organization_id })`
   (matrix: `org_owner`).
2. **Future-reservation guard:** count confirmed reservations with
   `starts_at > now()` for the venue. If any → reject `TV703`
   (`venue_has_future_reservations`, new) telling the caller to run the
   §02 cancel-and-notify flow first. (The full cancel flow stays in §02; this
   sub-unit only guards.)
3. Inside one `db.transaction`: set `restaurants.archived_at = now()`;
   decrement `current_venue_count`; insert `venue_addition_log`
   (`action: 'removed'`).
4. Commit.
5. After commit: `billingHooks.onVenueRemoved(...)` (no-op now). Same
   failure-mode as add.
6. `AUDIT.organization.updated`, `context: { event: 'venue_removed', restaurant_id, reason, venue_count_after }`.

### 4.3 `reactivateVenue({ restaurantId }): ActionResult`

Mirrors `addVenueToOrg` but does NOT create a row: assert the restaurant is
archived + belongs to the org, set `archived_at = null`, increment counter,
log `action: 'reactivated'`, call `onVenueAdded`, audit. Re-applies the same
tier + `max_venues` gates as add.

## 5. Reconcile job (§10.1)

`JOBS.multiLocation.reconcileVenueCount = "multi_location.reconcile-venue-count"`,
scheduled nightly. For every org, compare `current_venue_count` against
`count(restaurants where organization_id = org.id and archived_at is null)`.
On mismatch: write the correct count, log to Sentry, and emit
`AUDIT.organization.updated` `context: { event: 'counter_reconciled', from, to }`.
Defence-in-depth backstop; the transaction in §3 prevents partial-fail drift
in the first place.

## 6. Foundations registry additions

- `src/lib/jobs/keys.ts`: add `multiLocation: { reconcileVenueCount: "multi_location.reconcile-venue-count" }`.
- `src/lib/errors/codes.ts` (TV700–TV799 §09 range): add
  - `TV702` `venue_cap_reached`
  - `TV703` `venue_has_future_reservations`
  (`TV701` `multi_venue_upgrade_required` already exists.)
- No new `AUDIT` keys — reuse `AUDIT.organization.updated` with `event` in `context`.

## 7. Testing

Vitest unit tests with injected deps (no real Stripe; the hook is a no-op):

- `addVenueToOrg`: tier-gate rejects `base`, allows injected `pro`; counter
  increments inside the transaction; `venue_addition_log` written with correct
  `venue_count_after`; `max_venues` cap enforced; audit emitted; billing-hook
  called once post-commit; hook failure does not roll back.
- `removeVenueFromOrg`: future-reservation guard rejects when bookings exist;
  archive sets `archived_at` + decrements; log + audit written.
- `reactivateVenue`: un-archives + re-increments; re-applies tier/cap gates.
- Reconcile job: detects drift, self-heals, emits `counter_reconciled` audit.
- `venue-hooks.ts`: no-op stubs resolve without error (placeholder contract test).

`npx tsc --noEmit` clean; lint at baseline.

## 8. Risks / notes

- **Stub interaction:** the `base`-returning `loadActiveSubscription` stub makes
  the live multi-venue happy path unreachable until W5-B. Accepted — DI covers
  tests; W5-B swap unblocks production. Documented in code with a `TODO(W5-B)`.
- **Prod migration ordering:** 0040 cannot be applied to prod until the pending
  0033–0039 batch is applied (MEMORY: user-triggered). This sub-unit ships code
  + migration file; prod apply is queued behind the existing batch.
- **archived_at retrofit:** scoped to hot read paths only (§2.2); a full
  every-query sweep is out of scope and tracked as a follow-up if needed.
```
