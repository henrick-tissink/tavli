# 09 — Multi-location

> Pro-tier scaling: how an organisation runs multiple restaurants under one subscription, with location-aware permissions, per-location reporting, aggregated rollups, and the operational UX of switching between venues.

**Dependencies:** last verified compatible with `00-foundations.md` 2026-05-20. Re-check on foundations contract changes — specifically §3.2 `ActionResult<T>`, §3.4 `can()`/`requireCan()` (`org.add_venue`, `restaurant.delete`), §4.3 trigger policy (this doc uses app-managed counter, NOT a trigger), §4.6 soft-delete convention (`archived_at`), §16.1 ERROR_CODES (TV700–TV799 owned here), §16.2 AUDIT (`AUDIT.organization.updated` for venue add/remove events).

## Contents

- [1. Scope](#1-scope)
- [2. Current state](#2-current-state)
- [3. Architectural pillars](#3-architectural-pillars)
- [4. Data model](#4-data-model) — `organizations.brand_*` + counter (§4.1), `restaurants.archived_at` (§4.1a), `venue_addition_log` (§4.2), app-managed counter (§4.3)
- [5. APIs / interfaces](#5-apis--interfaces) — add, remove, reactivate, switch context
- [6. UI surfaces](#6-ui-surfaces) — org dashboard, venue switcher, add-venue flow, venue list, reports
- [7. Operational: shared resources vs per-venue](#7-operational-shared-resources-vs-per-venue) — scope matrix; suppression scope (§7.1)
- [8. Cross-venue search](#8-cross-venue-search) — inquiry fanout (§8.1)
- [9. Onboarding a multi-venue chain](#9-onboarding-a-multi-venue-chain)
- [10. Background jobs](#10-background-jobs)
- [11. Build sequence](#11-build-sequence)
- [12. Open questions](#12-open-questions)
- [13. Cross-references](#13-cross-references)

## 1. Scope

This domain owns: the multi-venue UX surfaces (org dashboard, venue switcher, "add a venue" flow), the per-location billing math glue between §12 and the venue count, and the aggregated rollup queries that surface org-wide views of data otherwise scoped to single venues.

It does **not** own: the `organizations` table (→ §01), the `organization_members` permission model (→ §01), the Stripe subscription mechanics or per-location €15/mo math (→ §12 — this doc supplies the venue counter that §12 multiplies), the underlying analytics aggregates (→ §07 — this doc composes them).

This is the smallest greenfield domain — mostly it's UX composition over primitives that §01 + §07 + §12 already provide.

### Checkboxes covered

From LFC §2 Tavli Pro:
- [ ] Up to 3 locations per account included
- [ ] €15/mo billing for each additional location *(billing mechanics in §12; venue counter here)*
- [ ] Location-aware staff permissions *(designed in §01 — `organization_members` + `restaurant_staff` with the §01 §4.3 permission matrix; this doc covers operational UX)*
- [ ] Per-location reporting + aggregated rollups

Note: the spec's public copy refers to "5+ locations" as needing a custom contact ("write to hello@tavli.ro"). The architecture in this doc supports unlimited locations technically; the cap is a pricing-page positioning choice, not a data-model constraint.

## 2. Current state

Per §01, after this turn's foundations land:
- `organizations` table exists.
- `restaurants.organization_id` exists (every venue belongs to an org).
- `organization_members` for org-wide staff (regional manager pattern).
- `restaurant_staff` for venue-specific staff (single-venue host).
- `default_organization_id` on `profiles` for last-active-context.
- The `can(...)` helper resolves permissions across both membership tables.

**What's still missing for multi-location specifically:**
- No UI surface that lists all venues in an org with quick-stats.
- No venue switcher in the partner nav.
- No "add a venue to existing org" flow.
- No aggregated rollup analytics view (per §07, the queries exist; the view doesn't).
- No venue count surfaced for billing math.

## 3. Architectural pillars

### 3.1 Org is the subscription unit; venues are inventory

A subscription belongs to an `organization`. The org has a count of `restaurants` (where `archived_at is null`). Billing math: `base_subscription + max(0, restaurant_count - 3) × €15/mo`.

When a venue is added or removed, an event fires that §12 picks up to update the Stripe subscription's quantity-based line item.

### 3.2 Venues are independent operationally; aggregated for reporting

Each venue runs its own service: own floor plan (§08), own staff list (in addition to org-wide), own menus, own reviews. The data does not blend.

Reporting blends. Pro dashboards have an org-rollup view (per §07) that sums across venues. The org dashboard surfaces "today across all your venues — 142 covers booked, 18% no-show."

### 3.3 The cross-venue customer DB is the deepest blending

Per §03, diners are scoped to `organization_id` — one Maria across all of Tom Yum Group's 5 venues. This is the marquee Pro feature. It lives in §03; this doc references it.

### 3.4 Permissions follow the org/venue split designed in §01

- Org-level roles (`org_owner`, `org_admin`, `org_manager`) act across all venues.
- Venue-level roles (`venue_owner`, `venue_manager`, `venue_host`) act on one venue.
- The matrix in §01 §4.3 governs every check.

## 4. Data model

This domain adds very little to the schema — most exists.

### 4.1 New columns on `organizations`

```sql
alter table organizations
  add column max_venues integer,                              -- nullable; null means "no hard cap, use tier rules"
  add column current_venue_count integer not null default 0,  -- denormalised cache; app-managed (see §4.3)
  add column brand_primary varchar(7),                         -- hex; org-level brand default; venue may override
  add column brand_secondary varchar(7);
```

`max_venues` lets Tavli admin override the tier-based default (e.g., a 12-location chain on a negotiated contract). Default behaviour: `null` = enforce tier rules in application code (Base = 1, Pro = unlimited with billing on >3).

`current_venue_count` is maintained by application code in `addVenueToOrg` / `removeVenueFromOrg` / `reactivateVenue` actions (NOT a DB trigger — see §4.3). The nightly reconcile job (§10) is the drift backstop. Cached because billing math reads it on every Stripe webhook.

`brand_primary` + `brand_secondary` are org-level brand-colour defaults. Each restaurant may override via `restaurants.brand_primary` / `brand_secondary` (added by §05 §3.4); the venue page renders the effective colour as `coalesce(restaurants.brand_primary, organizations.brand_primary)` — see §12 open question 9.

### 4.1a New columns on `restaurants`

```sql
alter table restaurants
  add column archived_at timestamptz;   -- soft-delete marker per foundations §4.6 + §05 + §08 convention
```

The soft-delete pattern matches §08 `restaurant_tables.archived_at` exactly: an archived row stays in the DB so historical reservations, reviews, and analytics references remain coherent. All "active venue" queries filter `where archived_at is null`. Re-activation (§5.3) sets `archived_at = null`. This is the **canonical "is this venue active" check across all domains** — `is_active = true` does NOT exist as a column; use `archived_at is null`.

### 4.2 New table: `venue_addition_log`

Audit-side track of venue additions for billing reconciliation.

```sql
create table venue_addition_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  action varchar(20) not null,                                -- 'added' | 'removed' | 'reactivated'
  by_user_id uuid references auth.users(id) on delete set null,
  venue_count_after integer not null,
  billing_impact_cents integer,                                -- per-month delta; positive = upcharge, negative = credit
  stripe_subscription_item_id varchar(80),                     -- when billed (added by §12 webhook)
  created_at timestamptz not null default now()
);

create index venue_addition_log_org on venue_addition_log (organization_id, created_at desc);

-- RLS
alter table venue_addition_log enable row level security;

create policy "venue_addition_log_org_admin_read" on venue_addition_log
  for select using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
        and is_active = true
        and role in ('owner', 'admin')
    )
  );

-- Inserts are service-role only (the addVenueToOrg / removeVenueFromOrg actions).
```

Reads by §12 for proration math and by audit/compliance for billing-dispute resolution.

### 4.3 App-managed counter (NOT a trigger)

Per foundations §4.3 (no new triggers for derived fields in v1), `organizations.current_venue_count` is maintained in application code, not via a DB trigger.

`addVenueToOrg` (§5.1) increments the counter inside the same transaction as the `restaurants` insert. `removeVenueFromOrg` (§5.2) decrements. The reconcile job (§10.1) catches any drift nightly.

The insert + counter increment MUST run inside an explicit `db.transaction(...)` block — not as two separate statements. Without the transaction wrapper, a crash between the two statements leaves the counter out of sync with `count(restaurants where organization_id = $org_id and archived_at is null)`, drifting billing math until the nightly reconcile catches it:

```ts
await db.transaction(async (tx) => {
  await tx.insert(restaurants).values({ organizationId, ... });
  await tx.update(organizations)
    .set({ currentVenueCount: sql`current_venue_count + 1` })
    .where(eq(organizations.id, orgId));
});
```

The nightly reconcile (§10.1) catches drift as a defence-in-depth backstop; the transaction prevents partial-fail drift in the first place. Simpler than a DB trigger, fully transactional, visible in the codebase, testable. The Drizzle ORM handles the SQL fragment for the atomic increment.

## 5. APIs / interfaces

### 5.1 Add a venue to an existing org

```ts
// src/app/partner/org/[orgId]/venues/actions.ts

export async function addVenueToOrg(input: AddVenueInput): Promise<ActionResult<{ restaurant_id: string }>>
```

Logic (single `db.transaction` per §4.3):
1. `requireCan(session, 'org.add_venue', { kind: 'organization', id: orgId })` (foundations §3.4).
2. Validate Zod schema (name, city, address, optional details).
3. Check tier via `loadActiveSubscription(orgId)` (§12 §3.5): if `tier === 'base'`, reject with `code: 'TV701'` (upgrade required for multi-venue) and an upgrade CTA — Base is single-venue only.
4. Check `max_venues` cap if set; reject if exceeded.
5. Inside the transaction: insert `restaurants` row with `organization_id`, `status = 'draft'`, `archived_at = null` (default).
6. Insert `restaurant_staff` row for the inviter as `'owner'` (operational ownership of the new venue).
7. **Increment** `organizations.current_venue_count = current_venue_count + 1` (same transaction — see §4.3 transaction example).
8. Insert `venue_addition_log` row with `action = 'added'`.
9. Commit the transaction.
10. Notify §12 via `billingHooks.onVenueAdded({ orgId, restaurantId })` → §12 updates the Stripe subscription quantity (with proration). Async — failure here surfaces via Sentry but doesn't roll back the venue creation.
11. Send a "New venue added" email to org admins (template via §04).
12. Audit-log `AUDIT.organization.updated` with `context: { event: 'venue_added', restaurant_id, venue_count_after }`.
13. Redirect to the new venue's onboarding wizard at `/partner/restaurants/[newId]/onboarding` (per §14).

### 5.2 Remove a venue

```ts
export async function removeVenueFromOrg(input: { restaurantId: string, reason: string }): Promise<ActionResult<...>>
```

Soft-delete: set `restaurants.archived_at = now()` (per foundations §4.6 + §4.1a above). The venue's data stays (reservations, reviews, diners stay attached for export + audit). It just doesn't render in the org's active venue list, and the staff can't operate it.

Menu retention on closure: menus are venue-scoped. Closed venues' menus are archived — `restaurants.archived_at` set; menu rows soft-deleted via their own `menus.archived_at` (added by §05; do NOT hard-delete; archived menus support diner history "what they had last visit" and tax/accounting reconstruction). Historical visit records remain queryable. Reactivation un-archives both rows by setting `archived_at = null`.

1. `requireCan(session, 'restaurant.delete', { kind: 'restaurant', id: restaurantId, organization_id: ... })`.
2. Check there are no future confirmed reservations; if there are, require explicit "cancel-and-notify" flow (run §02 cancel-by-restaurant for each, with a structured reason).
3. Inside one transaction: set `restaurants.archived_at = now()`; **decrement** `organizations.current_venue_count = current_venue_count - 1`; insert `venue_addition_log` row with `action = 'removed'`.
4. Commit.
5. Notify §12 → Stripe subscription quantity decrements (prorated credit). Async; same failure-mode pattern as venue-add (§5.1 step 10).
6. Audit-log `AUDIT.organization.updated` with `context: { event: 'venue_removed', restaurant_id, reason, venue_count_after }`.

### 5.3 Reactivate a venue

Org admin restores a previously-deactivated venue. Mirrors `addVenue` but doesn't create a new restaurant row. `action = 'reactivated'`. Stripe quantity increments again.

### 5.4 Switch active venue context

```ts
export async function switchActiveVenueContext(input: { restaurantId: string }): Promise<ActionResult>
```

Verifies the user has access to the venue, sets a `tavli_active_venue` cookie (parallel to the `tavli_active_org` cookie from §01). Server components read this for venue-scoped queries.

If the venue's parent org differs from the active org, the org context also flips.

Middleware ordering: the venue-context middleware MUST run AFTER the org-context middleware (set by §01) — venue access is resolved within an org's permission scope, so the org context must already be on the request when the venue-context check runs.

## 6. UI surfaces

### 6.1 Org dashboard (`/partner/org/[orgId]`)

The landing page for any Pro org with multiple venues. (For single-venue orgs, redirect straight to that venue's dashboard.)

Sections:
- **Org header**: name, plan badge, current venue count, "Add venue" CTA (gated by tier + permission).
- **Today across all venues**: covers booked, covers seated, current no-show rate, current top-loaded venue (most full right now).
- **Venue grid**: cards, one per venue. Each card shows:
  - Venue name + city
  - Today's covers / capacity bar
  - Current status (open, closed for the day, draft)
  - Click → drill into that venue's day view
- **Org-wide reviews**: stream of reviews across venues, last 7 days.
- **Org-wide analytics CTA**: link to `/partner/org/[orgId]/analytics` (§07 rollup view).
- **Org settings + members** (gated on role): links to settings pages designed in §01.

### 6.2 Venue switcher in partner nav

Present when the logged-in user has access to more than one venue (either via multiple `organization_members` rows or a mix of org + venue staff).

Compact dropdown in the nav, with:
- Current venue name (large).
- Current org name (small, above).
- List of accessible venues grouped by org.
- "Switch to org dashboard" link.
- "Add venue" link (gated).

Clicking a venue calls `switchActiveVenueContext` then routes to that venue's day view.

### 6.3 "Add a venue" flow (`/partner/org/[orgId]/venues/new`)

Multi-step form similar to the partner sign-up flow in §01, but skipping the org creation:
1. Venue basics — name, city, address.
2. Schedule (opening hours) — defaults to "Mon–Sun 12:00–22:00" with editable per-day.
3. Cuisines + price level (optional).
4. Plan confirmation — shows "+€15/mo" if this brings the org above 3 venues, "no change" otherwise.
5. Confirm + create.

On submit: `addVenueToOrg` action runs; success redirects to `/partner/restaurants/[newId]/onboarding` (the §14 onboarding wizard).

### 6.4 Venue list management (`/partner/org/[orgId]/venues`)

Shows all venues (active + inactive), with per-venue:
- Status badge (active / inactive / draft).
- Date added.
- Total bookings to date.
- Quick links: open, deactivate, transfer (admin only).
- Filter chips: status, city.

### 6.5 Per-location vs aggregated reports

The dashboards in §07 already have an org rollup view (`/partner/org/[orgId]/analytics`). This doc just ensures the venue list there is correctly scoped:
- Toggle "all venues" (default) / specific venue picker.
- Sum charts roll up.
- "Split by venue" toggle re-renders with per-venue lines.

## 7. Operational: shared resources vs per-venue

Decision-by-decision: which entities are org-scoped vs venue-scoped?

| Entity | Scope | Why |
|---|---|---|
| Subscription | org | One plan, one bill, multiple venues. |
| Diner profile | org | The marquee Pro feature (cross-venue history). |
| Marketing consent | org (within diner) | A diner who unsubs from Tom Yum Bucharest unsubs from Tom Yum Cluj too — same legal entity, same data controller. |
| Marketing campaigns | org by default; venue-scoped optional | A "winter menu" campaign can run across the chain or just one venue. |
| Staff (org members) | org | Regional manager pattern. |
| Staff (venue staff) | venue | Host at one location. |
| Restaurants (= venues) | venue | The unit of operation. |
| Reservations | venue | A booking is at a specific venue. |
| Floor plan / tables | venue | Each venue has its own physical space. |
| Reviews | venue | Each review is of a specific dining experience at one venue. |
| Menus | venue | Each venue can have different menus. |
| Photos | venue | Each venue has its own photography. |
| Corporate events / inquiries | venue (with cross-venue match) | An inquiry is for a venue, but lead routing matches across the org's venues. |
| Audit logs | both | Each row is org-scoped + venue-scoped; queries filter as needed. |

Locked decisions across all these — surfaces in this doc but the data is owned by the relevant domain.

### 7.1 Suppression scope (cross-ref §11)

Marketing suppression is organization-level. A diner who unsubscribes from venue A's SMS cannot receive SMS from any venue in that org — same legal entity, same data controller, single suppression record per (org, channel, recipient). Multi-venue operators are warned in the campaign builder: "this segment has N diners; M are suppressed (org-wide)." The suppression table is keyed by `(organization_id, channel, recipient_identifier)` (per §11 §4.8) — there is no venue-scoped marketing suppression in v1.

## 8. Cross-venue search

A Pro org operator opens any partner-portal search and the scope defaults to org-wide:
- Diner search: `/partner/diners` searches across all venues' diners. (Per §03.)
- Reservation search: across all venues, with a per-venue filter.
- Review search: across all venues.

The current-active-venue context affects the "create a new" CTAs (a new reservation goes into the active venue), but search is org-wide.

### 8.1 Multi-venue inquiry fanout (cross-ref §10)

For a corporate inquiry matching N venues in one org's city, all are ranked together; top 5 by `match_score` are notified. If multiple venues from the same org rank top, the inquiry is sent once and the org-owner notification lists all candidates (single email body, "These 3 venues in your group are good matches"). This prevents flooding the same org with redundant per-venue notifications. The matching/ranking lives in §10 §5.2; this section documents the consolidation rule that applies when multiple matches share an organization.

## 9. Onboarding a multi-venue chain

When a Pro org signs up with the intent of adding multiple venues (e.g., Tom Yum's 5 locations):

1. Sign-up creates the org + first venue (per §01 §5.2).
2. The setup playbook (§14) recommends sequential onboarding — focus on one venue's content (page, photos, menus) at a time — to avoid context-switching cost while authoring. This is the operational guidance Tom Yum was given in the WhatsApp follow-up. Operators are NOT blocked from a parallel approach: they can add all venues upfront and populate in parallel via the venue-list management page (§6.4). The recommendation is a UX nudge, not an enforced workflow.
3. After venue #1 ships, the org dashboard shows an "Add venue" CTA prominently.
4. Each subsequent venue goes through the same onboarding wizard — but faster, because the org-level settings (legal entity, brand colours, billing) carry over.

The cross-venue customer DB starts building from venue #1's diners. When venue #2 launches, its first booking from a returning diner already says "Returning — last visited venue #1 three weeks ago."

## 10. Background jobs

| Job | Schedule | Purpose |
|---|---|---|
| `multi_location.reconcile-venue-count` | nightly | Sanity-check: for every org, `current_venue_count == count(restaurants where organization_id = $org_id and archived_at is null)`. Log mismatch to Sentry. Self-heals if drift detected (writes the correct count + an `AUDIT.organization.updated` with `context: { event: 'counter_reconciled', from, to }`). |
| `multi_location.refresh-org-dashboard-cache` | every 5 min during business hours, every 15 min otherwise | Refresh the "today across all venues" pre-computed aggregate for the org dashboard. (Optional — depends on §07's pre-compute being live. Otherwise dashboard queries directly.) |

No domain-unique heavy jobs; mostly reuses §07.

## 11. Build sequence

1. **`organizations.max_venues` + `organizations.current_venue_count` columns + trigger.** *(0.5 day)*
2. **`venue_addition_log` table + RLS.** *(0.3 day)*
3. **`addVenueToOrg` server action + tier check + Stripe handoff (stubbed for now; wired by §12).** *(1 day)*
4. **`removeVenueFromOrg` + reactivate.** *(0.5 day)*
5. **`switchActiveVenueContext` + cookie + middleware to read context.** *(0.5 day)*
6. **Org dashboard page** — venue grid, today-across-all stats card, org-wide reviews stream. *(2 days)*
7. **Venue switcher dropdown in partner nav.** *(1 day)*
8. **"Add a venue" multi-step flow.** *(1.5 days)*
9. **Venue list management page** (active/inactive filter, transfer, reactivate). *(1 day)*
10. **Org-rollup analytics view** — composes §07 dashboard with org-scoped queries. *(1 day)*
11. **Cross-venue search defaults** — update search components to default to org scope. *(0.5 day)*
12. **Nightly reconcile job.** *(0.3 day)*
13. **Visual regression tests** — venue switcher, org dashboard, add-venue flow. *(0.5 day)*

**Total: ~10–11 working days** — small because so much primitives exist in §01 + §07.

## 12. Open questions

1. **Should a Base org be upgradeable to Pro at any moment, or only on a billing cycle boundary?** Recommendation: anytime, prorated. Tier upgrade triggers a Stripe subscription update with proration (§12 owns the math). Smooth UX, modest accounting complexity.

2. **What about downgrading from Pro to Base with multiple venues?** Recommendation: block the downgrade until they remove venues down to 1. Force the destructive choice to be explicit. Show a list of venues that will be deactivated.

3. **Multi-currency for international expansion (e.g., Tavli expanding to DE)** — should each venue have its own currency? Recommendation: not in v1. The org-level subscription bills in EUR (per spec). DE expansion needs §12 changes for VAT/MwSt and may need per-venue local currency on the subscription. Defer.

4. **Inter-org venue transfer** (org A sells venue 3 to org B): recommendation, admin-only, audit-heavy. Edge case for v1.5+.

5. **What's the public-pricing-page boundary?** The data model supports unlimited locations; the public pricing positioning at §15 caps Standard at 5 (then custom contact). A soft cap of 10 in code (`max_venues = 10` default, override via admin) prevents accidental abuse pre-revenue. Pricing-page language ("Running 5+ locations? Email us." for genuinely-larger chains where bespoke pricing makes sense) is a §15 concern, not an architectural constraint. Tom Yum-style 5-venue orgs price as standard Pro €60 + €15 × 2 = €90 with no special handling; the soft cap only fires beyond ~10 venues.

6. **Should the org dashboard show financials (revenue, covers × avg-cover-value)?** Recommendation: not in v1. Tavli isn't a POS integration; we can't claim revenue with accuracy. Show covers + bookings; let owners infer revenue themselves. v2 once POS integration lands.

7. **What about a "compare two venues" report?** Recommendation: nice-to-have. Defer to v1.5 unless a Pro restaurant specifically asks.

8. **Should staff at venue A be able to see (read-only) what's happening at venue B in the org?** Recommendation: only org-level roles (org_admin / org_manager) see across venues. Venue-level staff stay scoped. Privacy + cognitive-load reasons.

9. **Custom per-venue branding (different brand_primary per restaurant in the same org)** — allowed? Recommendation: yes, with explicit inheritance semantics. Brand defaults live at the org level (`organizations.brand_*`). Each restaurant may override via `restaurants.brand_primary` etc. Override is opt-in: a venue with NULL brand columns inherits the org's. The venue page renders with the venue-effective brand (resolved as `coalesce(restaurants.brand_primary, organizations.brand_primary)`). Multi-venue operators should be aware: white-label venues across markets can diverge visually; centrally-managed chains should leave override null. (Tom Yum example aside — most chains *want* consistency, but allowing override has zero cost.)

10. **Should the venue switcher remember per-device or per-user?** Recommendation: per-user via `default_organization_id` (already in §01). The cookie carries within a device session; the profile setting carries the most-recent choice across devices. On new device, fall back to profile.

## 13. Cross-references

- **§00 Foundations** — pg-boss for the reconcile job, cookies for active-venue context.
- **§01 Identity & accounts** — `organizations`, `organization_members`, `restaurant_staff`, `default_organization_id`, the `can()` matrix all consumed by this doc.
- **§02 Bookings** — search defaults switch to org scope.
- **§03 Diner database** — org-scoped diners are the showpiece feature this doc surfaces.
- **§04 Diner communication** — "New venue added" email template.
- **§05 Venue page** — each new venue gets its own venue page; the onboarding flow drives content authoring.
- **§07 Analytics & reports** — org rollup analytics view composes existing per-restaurant queries.
- **§10 Corporate events** — lead routing fans out across org venues matched on cuisine + capacity + price point + locale (locale-matching logic is owned by §10; cross-reference §10 §5.2 for the algorithm).
- **§11 Marketing suite** — campaigns can scope to org-wide or per-venue.
- **§12 Billing & subscriptions** — venue count drives per-additional-location billing; this doc emits the events §12 listens for.
- **§14 The setup** — multi-venue onboarding cadence.
- **§15 Public pricing page** — "5+ locations? Email us" boundary lives in pricing copy; the data model accepts any count.

---

*Last updated: 2026-05-20.*
