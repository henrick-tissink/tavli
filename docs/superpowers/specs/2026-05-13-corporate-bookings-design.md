# Corporate Bookings — Design Spec

**Date:** 2026-05-13
**Status:** Phase 1 implementation plan written at `docs/superpowers/plans/2026-05-13-corporate-bookings-phase-1-private-events.md`. Phase 1 implementation in progress on branch `feat/corporate-bookings-phase-1`. Phases 2–4 plans pending.
**Anchor:** First-class "corporate" capability surface on top of today's guest-only reservation primitive.

## Goal

Make every venue on the platform (restaurants, coffeeshops, all `restaurants` rows) capable of offering one or more *corporate booking* flavors, independently and opt-in. A "corporate booking" is not one feature — it is four distinct capabilities that share infrastructure but solve different jobs:

1. **Private events / venue hire** — request → quote → accept flow for 10–200+ person events held in private rooms or whole-venue buyouts.
2. **Corporate accounts** — *company* (legal entity, RO CUI-bearing) as a first-class customer; employees book under its umbrella with centralized billing-context, reporting, member roles, and optional approval/budget policy.
3. **Standing / recurring reservations** — one booking intent materializes into many reservations on a recurrence rule (e.g., weekly leadership lunch).
4. **Meeting / working bookings** — duration-based booking of bookable nooks/rooms at coffeeshops or hybrid venues, paid per hour (first paid flow on the platform).

The spec covers all four as one cohesive design anchored on a shared `companies` primitive and an opt-in capability model. The implementation plan that follows will ship the design in phases — each phase is independently shippable.

## Non-Goals

- **Whole-day venue contracts with custom legal terms.** Sales-led, off-platform, not a product surface.
- **Catering / off-site delivery.** Different commerce surface; out of scope.
- **Human concierge** booking on the company's behalf. Phase N+.
- **Multi-venue corporate accounts spanning a restaurant chain as one corporate billing unit.** Each `restaurants` row is independent; a chain that wants consolidated billing is out of scope for v1.
- **Full RRULE flexibility** for standing reservations. Weekly + biweekly cover the realistic v1 cases.
- **Platform-mediated payment for event requests.** Event payments stay broker-style (consumer pays venue directly) in v1; Stripe is introduced only for meeting nooks. Platform-mediated event deposits are a v1.1 enhancement.
- **In-product full data-export self-service.** GDPR rights routed through the existing `privacy@tavli.ro` mailto pattern (see `2026-05-12-gdpr-legal-pages-design.md`).
- **POS integration for live diner spend tracking.** Platform doesn't see food costs; venue invoices the company directly via eFactura.

## Brainstorm Decisions

| # | Decision |
| --- | --- |
| 1 | Scope: **All four flavors** designed under one shared architecture. Phased implementation. |
| 2 | Slicing strategy: **Comprehensive design + phased build.** Single design doc; plan stages shippable phases. |
| 3 | Phase 1 anchor: **Private events** (highest unmet RO market need; doesn't require billing infra). |
| 4 | Capabilities are **per-venue opt-in, independent**. Default OFF for every existing venue. |
| 5 | Anonymous event-request submissions: **not allowed**. All event requests require an account. |
| 6 | Account creation timing: **at submit, not at form entry** (server stores `draft` event request, OTP promotes to `new`). |
| 7 | Company entity from anonymous-with-CUI submission: **stored as a *claim*, not auto-materialized**. Real `companies` row only when a verified admin claims the CUI. |
| 8 | Reservation materialization from accepted event requests: **partner-driven, not auto** (partner decides 1 row × 30 covers vs. N joined rows, private-room vs. whole-venue). |
| 9 | Data model strategy: **three boolean flags on `restaurants`** + one 1:1 settings table for events. NOT a generic capability key-value table. |
| 10 | Monetization: **engineering-agnostic**; a single `pro_plan_active` flag on `restaurants` gates capability-enable endpoints. GTM picks subscription vs commission later. |
| 11 | Meeting nook payment: **Stripe**, paid at booking, refund policy encoded per-space. |
| 12 | RO-specific layer: **CUI lookup via ANAF API**, eFactura via a third-party gateway (provider chosen at Phase 2c procurement), VAT/TVA modeled per-company. |

## Architecture

### Capability model

Each flavor is independently opt-in per venue:

| Flavor                 | Default | How partner opts in                  | Why a venue would say no                                |
|------------------------|---------|---------------------------------------|----------------------------------------------------------|
| Private events         | OFF     | Toggle in partner "Corporate" page   | Too small; no private space; doesn't want negotiation    |
| Corporate-meal flag    | OFF     | Toggle (commits to issuing invoices) | Can't/won't issue eFactura; cash-only                    |
| Standing reservations  | OFF     | Toggle                                | Capacity-protective; doesn't want recurring lockouts     |
| Meeting nooks          | derived | Add a `meeting_spaces` row           | No quiet space; loud-vibe café                           |

All existing venues start OFF for all of these. Partners explicitly opt in. New requests are server-side gated by the capability flag (defense in depth, not just UI hiding).

### Data model

New top-level entities (added by migration `0008_corporate_foundations.sql`):

```
companies                              -- the corporate customer (legal entity)
  id                  uuid PK
  name                text
  legal_name          text                  -- "S.C. ... S.R.L."
  cui                 varchar(20) UNIQUE    -- RO tax ID (mandatory in RO B2B)
  reg_com             varchar(40)           -- registru comerțului number
  billing_address     text
  billing_city        text
  billing_country     varchar(2) DEFAULT 'RO'
  vat_payer           boolean
  efactura_enabled    boolean DEFAULT true
  primary_contact_email   varchar(255)
  primary_contact_phone   varchar(32)
  status              company_status enum  -- pending_verification | active | suspended
  verified_at         timestamptz
  verified_by_user_id uuid FK -> profiles
  created_at, updated_at

company_members                        -- user ↔ company N:M
  company_id          uuid FK -> companies   (composite PK)
  user_id             uuid FK -> profiles    (composite PK)
  role                company_member_role enum   -- owner | admin | booker | viewer
  budget_monthly_cents integer             -- optional per-member cap
  created_at

company_invitations                    -- sibling of existing `invitations` (NOT a kind discriminator on it)
  id                  uuid PK
  company_id          uuid FK -> companies
  email               varchar(255)
  role                company_member_role
  token_hash          varchar(64) UNIQUE
  invited_by_user_id  uuid FK -> profiles
  expires_at          timestamptz
  status              invitation_status enum    -- pending | claimed | expired | revoked
  claimed_at, claimed_by_user_id
  created_at

event_requests                         -- Phase 1 negotiation object
  id                  uuid PK
  restaurant_id       uuid FK -> restaurants
  company_id          uuid FK -> companies        -- nullable; only when attached to verified company
  claimed_company_cui   varchar(20)               -- anonymous-claim of company by CUI (not yet verified-attached)
  claimed_company_name  text
  requested_by_user_id uuid FK -> profiles       -- always set post-OTP-verify
  guest_name, guest_email, guest_phone           -- snapshot at submit time
  occasion            event_occasion enum         -- wedding | birthday | corporate_dinner | product_launch | other
  event_date          date
  event_time_preference text                      -- "lunch" | "evening" | specific time
  party_size          smallint
  space_preference    text
  budget_per_head_cents integer
  menu_preference     text
  dietary_notes, additional_notes
  status              event_request_status enum   -- draft | new | viewing | replied | quoted | accepted | declined | expired_quote | cancelled | expired | completed
  partner_response    text
  quoted_amount_cents integer
  quoted_at, quote_expires_at, accepted_at, declined_at, cancelled_at, completed_at  timestamptz
  decline_reason      text
  tracking_token      varchar(64) UNIQUE          -- consumer-facing tracking URL
  created_at, updated_at

restaurant_event_settings              -- 1:1 with restaurants (only present when events_intake_enabled = true)
  restaurant_id       uuid PK FK -> restaurants
  min_party_size, max_party_size
  min_lead_days
  accepted_occasions  event_occasion[]
  budget_per_head_guidance text                   -- "lei 150-400 typical"
  auto_reply_template text
  blackout_dates      jsonb                       -- array of {start_date, end_date}
  created_at, updated_at

availability_exceptions                -- one-off overrides to weekday rules (Phase 1 prerequisite)
  id                  uuid PK
  restaurant_id       uuid FK -> restaurants
  exception_date      date
  slot_start, slot_end  time (nullable for whole-day)
  override_capacity   integer        -- 0 = blocked; >0 = replaces default
  reason              text
  source_event_request_id  uuid FK -> event_requests   -- nullable; ties whole-venue buyouts back to their origin
  created_at

standing_series                        -- Phase 3 recurring intent
  id                  uuid PK
  restaurant_id       uuid FK -> restaurants
  company_id          uuid FK -> companies  (nullable)
  created_by_user_id  uuid FK -> profiles
  rrule               text          -- iCal RRULE, e.g. "FREQ=WEEKLY;BYDAY=FR"
  start_date, end_date  date
  party_size          smallint
  reservation_time    time
  zone                varchar(60)
  status              standing_status enum   -- active | paused | ended
  created_at, updated_at

meeting_spaces                         -- Phase 4
  id                  uuid PK
  restaurant_id       uuid FK -> restaurants
  name                text                       -- "Quiet Corner", "Pod A"
  capacity            smallint
  hourly_rate_cents   integer
  min_duration_minutes smallint DEFAULT 60
  max_duration_minutes smallint DEFAULT 240
  available_hours     jsonb                      -- per-weekday hours
  cancel_full_refund_hours  smallint DEFAULT 24
  cancel_partial_refund_hours smallint DEFAULT 6
  is_active           boolean DEFAULT true
  photo_storage_path  text
  created_at, updated_at

meeting_bookings                       -- Phase 4
  id                  uuid PK
  meeting_space_id    uuid FK -> meeting_spaces
  booked_by_user_id   uuid FK -> profiles  NOT NULL   -- someone always books
  company_id          uuid FK -> companies (nullable; only set when corporate)
  start_at, end_at    timestamptz
  party_size          smallint
  status              meeting_booking_status enum   -- confirmed | cancelled | completed | no_show
  amount_cents        integer
  paid_at             timestamptz
  payment_id          uuid FK -> payments
  cancellation_reason text
  created_at, updated_at

payments                               -- Phase 4 (future-proofed)
  id                  uuid PK
  stripe_payment_intent_id  text UNIQUE
  amount_cents        integer
  currency            currency_code
  status              payment_status enum    -- pending | succeeded | refunded | partial_refund | failed
  meeting_booking_id  uuid FK -> meeting_bookings   -- nullable (future: event deposits)
  created_at, updated_at

corporate_invoices                     -- Phase 2c (platform-side fees only)
  id                  uuid PK
  company_id          uuid FK -> companies
  period_start, period_end  date
  line_items          jsonb
  subtotal_cents, vat_cents, total_cents  integer
  status              invoice_status enum  -- draft | sent | paid | void
  efactura_xml        text
  anaf_upload_id      text
  issued_at, paid_at  timestamptz
  created_at, updated_at

partner_notifications                  -- light bell-icon surface (Phase 1)
  id                  uuid PK
  restaurant_id       uuid FK -> restaurants
  kind                varchar(40)    -- new_event_request | quote_accepted | standing_expiring | ...
  payload             jsonb
  read_at             timestamptz
  created_at
```

### Minimal additions to existing tables

```sql
ALTER TABLE restaurants
  ADD COLUMN events_intake_enabled    boolean NOT NULL DEFAULT false,
  ADD COLUMN accepts_corporate_meals  boolean NOT NULL DEFAULT false,
  ADD COLUMN accepts_standing         boolean NOT NULL DEFAULT false,
  ADD COLUMN pro_plan_active          boolean NOT NULL DEFAULT false;
-- meeting-nooks capability is derived: EXISTS (meeting_spaces WHERE restaurant_id = r.id AND is_active)

ALTER TABLE reservations
  ADD COLUMN booking_type        booking_type NOT NULL DEFAULT 'standard',
      -- standard | private_event | standing
  ADD COLUMN company_id          uuid REFERENCES companies(id),
  ADD COLUMN booked_by_user_id   uuid REFERENCES profiles(id),
  ADD COLUMN event_request_id    uuid REFERENCES event_requests(id),
  ADD COLUMN standing_series_id  uuid REFERENCES standing_series(id);
-- existing guest_name/phone/email stays as the fallback for legacy/anonymous flows.
```

The booking taxonomy is intentionally narrow:
- `standard`: manual reservation. Optionally has `company_id` (that's the "corporate-meal" affordance — no separate enum value needed).
- `private_event`: materialized from an accepted event request; carries `event_request_id`.
- `standing`: materialized from a standing series; carries `standing_series_id`.

Meeting bookings do NOT go through `reservations` — different inventory model (per-space, duration-based).

### RLS sketch

- `companies`, `company_members`: readable by members of the company; writable by `role IN (owner, admin)`.
- `event_requests`: readable by (a) restaurant owner via `restaurant_id`, (b) `requested_by_user_id`, (c) company members of `company_id` if set, (d) holders of `tracking_token` via a `SECURITY DEFINER` function `get_event_request_by_token(token)` mirroring the existing `confirmation_token` pattern on reservations.
- `restaurant_event_settings`: readable by anon (public); writable by restaurant owner.
- `availability_exceptions`: readable by anon; writable by restaurant owner.
- `meeting_spaces`: readable by anon when `is_active`; writable by restaurant owner.
- `meeting_bookings`: readable by booker, company members, restaurant owner; writable selectively.
- `payments`, `corporate_invoices`: readable by company members; writable by service-role only.

### Why these boundaries

- **`companies` ≠ `profiles`.** Companies have legal identity (CUI, eFactura), employees rotate, billing is at the entity level. Don't fuse individual + org identity.
- **`event_requests` ≠ `reservations`.** Event request is a *negotiation* (quote, decline reasons, partner thread). Once accepted, the partner materializes one or more `reservations` rows referencing back via `event_request_id`. Trying to fit quote/contract fields into `reservations` would bloat the table for the 99% of rows that don't need them.
- **`meeting_spaces` ≠ `restaurant_availability`.** Nooks are per-space + duration-based; dining tables are per-slot + party-size-based. Unifying them is the classic over-abstraction trap.
- **`company_invitations` ≠ `invitations`.** Existing `invitations` is restaurant-ownership-specific. Sibling table for company-membership keeps both domains clean.
- **Three boolean flags ≠ generic capability KV table.** We have 4 known capabilities, not 40. Type-safe SQL beats kv-table joins for this volume.

### Where new code lives

Mirrors existing layout conventions:

```
src/lib/db/schema.ts                   -- new tables added in-line; enums alongside existing
src/lib/repos/
  companies-repo.ts
  company-invitations-repo.ts
  event-requests-repo.ts
  standing-series-repo.ts
  meeting-spaces-repo.ts
  meeting-bookings-repo.ts
  payments-repo.ts
  partner-notifications-repo.ts
src/lib/integrations/
  anaf.ts                              -- CUI validation/lookup
  efactura.ts                          -- Phase 2c
  stripe.ts                            -- Phase 4
src/app/
  companies/
    new/page.tsx                       -- signup wizard
    [slug]/(dashboard)/
      page.tsx                         -- overview
      bookings/page.tsx
      members/page.tsx
      settings/page.tsx
      invoices/page.tsx                -- Phase 2c
  event-requests/[token]/page.tsx      -- public tracking page
  [city]/
    events/page.tsx                    -- capability landing
    meeting-nooks/page.tsx             -- capability landing
  partner/(dashboard)/
    corporate/
      page.tsx                         -- overview + capability toggles
      events/
        page.tsx, [id]/page.tsx        -- inbox + detail
      standing/
        page.tsx, [id]/page.tsx
      meeting-spaces/
        page.tsx, new/page.tsx, [id]/page.tsx
      corporate-diners/page.tsx        -- summary of corporate_meal reservations
  api/
    event-requests/actions.ts
    standing-series/actions.ts
    meeting-bookings/actions.ts
    companies/actions.ts
    cron/extend-standing/route.ts      -- daily materialization-window extension
    cron/expire-drafts/route.ts        -- purges draft event_requests > 30 min
    cron/expire-quotes/route.ts        -- flips past-due quotes
    webhooks/stripe/route.ts           -- Phase 4
src/components/
  event-request-sheet.tsx              -- consumer (mirrors reservation-sheet.tsx)
  recurrence-picker.tsx                -- Phase 3
  meeting-space-card.tsx               -- Phase 4
  meeting-booking-sheet.tsx            -- Phase 4
  company/
    CompanySignupWizard.tsx
    MembersList.tsx
    InviteMemberForm.tsx
    BookingsList.tsx
    BookingTypeChips.tsx               -- chip-row added to ReservationSheet
  partner/
    EventRequestInbox.tsx, EventRequestDetail.tsx, QuoteForm.tsx, DeclineForm.tsx
    StandingSeriesList.tsx, StandingSeriesDetail.tsx
    MeetingSpaceEditor.tsx
    CorporateOverview.tsx              -- the toggle dashboard
    PartnerNotificationBell.tsx
src/emails/
  event-request-{new,replied,quoted,accepted,declined,expired,nudge}.tsx
  company-{invitation,verified,suspended}.tsx
  standing-{created,occurrence-skipped,cancelled}.tsx
  meeting-{confirmed,cancelled,refunded}.tsx
```

## Phase 1 — Private events

### Eligibility flag

```sql
restaurants.events_intake_enabled  boolean DEFAULT false
```

Plus the optional 1:1 `restaurant_event_settings` row that lets partners configure min/max party, lead time, accepted occasions, blackout dates, and a canned auto-reply template.

### Consumer flow

1. **Discovery**. Secondary CTA on venue page next to "Rezervă o masă": "Organizează un eveniment / Plan an event". Visible only when `events_intake_enabled=true`. When false, the CTA is silently absent — no "we don't offer this" copy.
2. **`EventRequestSheet`** (mirrors `reservation-sheet.tsx`):
   - Occasion chips (wedding / birthday / corporate dinner / product launch / other) — gated by venue's `accepted_occasions`.
   - Date (calendar; not the slot grid).
   - Time preference (chips: lunch / evening / late; optional specific time).
   - Party size (validated against venue's min/max).
   - Space preference (free text).
   - Budget per head (optional).
   - Menu preference + dietary checkboxes.
   - Notes.
   - Identity step (last in the sheet, not a gate up front):
     - If signed in: pre-filled.
     - If not: email → server creates `event_requests` row with `status='draft'`, returns signup-token, sends OTP → user enters OTP → Supabase `signInWithOtp` completes → `status` promotes to `new`, `requested_by_user_id` set. Drafts > 30 min old purged by cron.
     - Optional "Booking on behalf of a company?" toggle. If yes + CUI provided: stored as `claimed_company_cui` + `claimed_company_name`. **NOT** a `companies` row. Full corporate attachment (`company_id` set on the request) requires Phase 2a company signup; until then the request stays "claim-tagged but not company-attached," and Phase 2a's reconciliation step links it retroactively when the real owner signs up.
3. **Tracking page** at `/event-requests/[token]`:
   - Status banner + timeline (new → viewing → replied → quoted → accepted/declined).
   - Latest partner reply.
   - When `status='quoted'`: Accept / Decline buttons.
4. **Acceptance**: server action transitions status to `accepted`, sends confirmation email both ways. Reservation materialization happens partner-side after.

### Partner flow

1. **Sidebar entry**: single top-level "Corporate" link → `/partner/corporate`. The overview page is the toggle dashboard with internal sub-nav (cards/tabs per capability). No nested sidebar engineering.
2. **Inbox** (`/partner/corporate/events`): table — occasion, date, party size, requester name, days since submit, status. Visibility rule: `events_intake_enabled = true OR EXISTS(open event_requests)` so partners don't lose access to inboxes mid-negotiation if they disable.
3. **Detail view**: full request body + status timeline + reply thread + conflict banners (overlapping reservations / standing series for that date).
4. **Actions**:
   - Mark as viewing (auto on first open after the initial `new`).
   - Reply (free text, emails consumer).
   - Send quote (amount in lei, optional pre-set-menu attachment, expiry date).
   - Decline (reason picklist + free text).
5. **On consumer acceptance**: "Materialize reservation(s)" affordance. Partner picks:
   - **Private room**: creates N reservation rows with `booking_type='private_event'`, `event_request_id` set, optional `zone='Private Room'`. Does NOT touch dining inventory.
   - **Whole venue / time block**: same reservation row(s) PLUS one or more `availability_exceptions` rows for that date/time with `override_capacity=0` and `source_event_request_id` set. Dining grid for that date/time is blocked.

### State machine

```
                  partner opens      partner replies        partner sends quote
   draft → new → viewing  ───────→   replied   ──────────→   quoted
   (OTP)                                                       │
                                                  ┌────────────┼─ consumer accepts → accepted → materialize → completed
                                                  │            │
                                                  │            └─ expires (quote_expires_at) → expired_quote
                                                  │
                                                  └─ consumer declines → declined
   any pre-accepted state → consumer cancels → cancelled
   new for >21 days with no partner action → expired (terminal)
```

### Files & components (Phase 1)

See "Where new code lives" above for the inventory. Phase 1 ships the foundation, so it includes: capability flags, `companies` table (claim-only attachment), `company_members`, `company_invitations`, `event_requests`, `event_settings`, `availability_exceptions`, `partner_notifications`, plus the consumer + partner UIs for events. It does NOT include `/companies/[slug]` dashboard, standing series, meeting spaces, or invoicing — those are later phases.

### Error handling

- **Duplicate submit**: dedupe by `(restaurant_id, requested_by_user_id, event_date, party_size)` within 5 minutes; return existing token instead of creating a new row.
- **Lost tracking link**: public re-issue page asks for email + last-known event date; emails a fresh tracking link.
- **Partner silence**: daily job nudges at day 3, 7, 14; auto-`expired` at day 21 (terminal).
- **Quote expiry**: daily job flips quotes past `quote_expires_at` to `expired_quote`, notifies both sides; partner can re-quote (creates a new quote, keeps thread).
- **Tracking token forgery**: `tracking_token` is `varchar(64)` from `randomBytes(32)`; constant-time compare; rate-limit by IP.
- **CUI lookup failure**: ANAF API down → allow manual entry, store as `claimed_company_cui` regardless; verification stays pending.
- **Anonymous form persistence**: server-side `draft` status with 30-min TTL avoids client-state loss.
- **Auth race in `ReservationSheet`**: when an anonymous user signs in mid-sheet to expose corporate chips, sheet stays mounted; auth context refresh must NOT remount form state. Implement via stable React keys + the existing `auth-context.tsx` pattern.
- **Capability disabled mid-flight**: in-flight `event_requests` continue; new submissions return "This venue is no longer accepting event requests."

### Testing (Phase 1)

- **Unit**: state-machine transitions (every valid + every invalid edge); CUI format validation; `availability_exceptions` resolution; tracking-token gen.
- **Integration**: full submit-via-OTP flow; full partner-quote-→-accept-→-materialize flow; whole-venue buyout that produces `availability_exceptions`; quote expiry; partner-silence-nudge cycle.
- **RLS**: anon token grants only that row; partner can't read another venue's requests; consumer can't read another company's requests; SECURITY DEFINER function isolates token access.
- **Email**: RO + EN snapshot tests per template, matching the `2026-05-12-gdpr-legal-pages-design.md` pattern.
- **Playwright E2E**: happy path against the standing test partner account on tavli.ro (per project memory `test_partner_account.md`).

## Phase 2 — Corporate accounts

> **Implementation plan for 2a:** [docs/superpowers/plans/2026-05-17-corporate-bookings-phase-2a-corporate-accounts.md](../plans/2026-05-17-corporate-bookings-phase-2a-corporate-accounts.md)

### 2a. Foundation (consumer-side dashboard)

- **Signup wizard** at `/companies/new`: legal details (CUI lookup via `lib/integrations/anaf.ts` pre-fills name/legal_name/address/vat_payer), billing contact, invite team. Submit creates `companies` row in `pending_verification`.
- **CUI claim reconciliation**: at signup, server queries `event_requests WHERE claimed_company_cui = ?`. Any matching open requests get auto-attached (`company_id` set, `claimed_company_cui` cleared) once the signing-up user is verified as the company's admin. **Admin verification** runs in this order: (a) auto if the signup email's domain matches the company's public registered domain (ANAF returns this for many CUIs); (b) otherwise queued for admin-team manual review — claim-tagged requests remain in their `event_requests` rows but not attached until the manual verification completes. Both surfaces show on the company dashboard: "We attached N in-flight event requests" once reconciled.
- **Dashboard** at `/companies/[slug]`:
  - Overview — MTD spend (Phase 2c-derived), upcoming bookings, member count.
  - Bookings — filterable list of all `reservations + event_requests + meeting_bookings WHERE company_id = this`.
  - Members — list + invite via `company_invitations`. Roles: owner / admin / booker / viewer.
  - Settings — legal details, billing address, eFactura toggle, monthly budget cap default.

### 2b. Corporate-meal flag on existing reservation flow

`BookingTypeChips` component added to top of `ReservationSheet` for signed-in users with ≥1 `company_members` row. Chips:
- "Personal" (default, no `company_id`)
- "[Company X]" — one per company (only if `restaurants.accepts_corporate_meals=true` for that venue)

Selecting a company sets `company_id` on the reservation. Notes get a "Billable to {company.name}" line. Partner-side reservations list gains a "Type" column + filter; corporate-tagged rows show a small badge + the company CUI/address visible to partner staff so they can prepare the right commercial invoice.

### 2c. Invoicing (eFactura, deferred sub-phase)

- `corporate_invoices` table holds platform-side fees only. Venue-side food/service invoicing happens outside the platform (venue → company directly, with eFactura, using the CUI we surfaced).
- Monthly cron aggregates platform-side fees (event commissions, meeting bookings, corporate-meal per-booking fees if applicable) into a draft invoice per company.
- eFactura XML submission via a chosen gateway (SmartBill, Oblio, or FGO — picked at procurement time). Wraps SPV XML format. Held in `draft` until `companies.status='active'`.

### 2d. Budgets / approvals (lowest priority)

- `reservation_status` enum gets new value `pending_approval`.
- If a booking exceeds the booker's `budget_monthly_cents` or a per-booking ceiling on the company, status flips to `pending_approval` on creation.
- Company admins see pending items in the dashboard + receive email; approve/decline writes the final status; venue only sees confirmed bookings.

## Phase 3 — Standing reservations

### Creation

Two entry points:
- From `ReservationSheet`, a "Make this recurring" toggle (visible only when `accepts_standing=true` AND user is signed in).
- From `/companies/[slug]/bookings/new`, a full standing form.

`RecurrencePicker.tsx` builds an iCal RRULE under the hood with friendly UX: "Every {weekday} at {time}, until {end date}". v1 supports weekly + biweekly only.

### Materialization

- On series create: materialize the next 8 weeks of reservations in one transaction. Each row carries `standing_series_id` + `booking_type='standing'`.
- Daily cron `/api/cron/extend-standing` keeps the 8-week rolling window full.
- Capacity conflict at materialization: skip the conflicting occurrence; email consumer "Couldn't book {date}." Series continues for subsequent occurrences.
- Concurrency: per-restaurant advisory lock during the cron run so multiple materializations don't race.

### Controls

- Partner ("Corporate → Standing"): list active series; pause / cancel (with reason); cancellation cancels all future materialized rows + emails consumer.
- Consumer (in company dashboard or `/account/bookings`): pause, end early, change party size (forks the series at next occurrence).

## Phase 4 — Meeting nooks

### Partner setup

CRUD on `meeting_spaces` under "Corporate → Meeting spaces": name, capacity (2-8), hourly rate (lei), min/max duration, photo, available hours per weekday, cancellation policy hours. Toggle `is_active` per space. Existence of ≥1 active row makes the "meetings" capability live for that venue.

### Discovery & booking

- Venue page: "Book a meeting nook" CTA when ≥1 active space exists.
- Capability landing `/[city]/meeting-nooks`.
- `MeetingBookingSheet`: date → space carousel → time-range slider (constrained by space hours + min/max duration) → party size → notes → **Stripe Payment Element inline**.
- Confirmation page + email after webhook confirms.

### Payment + refund

- `payments` table tracks Stripe `PaymentIntent`. Webhook flips `meeting_bookings.paid_at` and `payments.status`.
- Cancellation logic uses per-space `cancel_full_refund_hours` / `cancel_partial_refund_hours`. Free cancel ≥24h before, 50% refund 6-24h, 0% <6h (defaults; per-space tunable).
- Refunds via `stripe.refunds.create`; `payment.status='refunded'|'partial_refund'`.

## Cross-cutting

### Monetization (engineering-agnostic)

`restaurants.pro_plan_active boolean` gate. Capability-enable endpoints check it. Whether `pro_plan_active` reflects a monthly subscription, a Stripe-Connect commission, or a hybrid is a billing decision that doesn't change schemas. Recommendation for GTM (not engineering-locked): Pro subscription for events + standing + corporate-meal (no live money flows; partner pays for inbound demand); per-booking commission for meeting nooks (because Stripe is already in the path). Don't gate Phase 1 behind paywall during initial rollout — earn adoption first.

### RO-specific layer

- **CUI lookup** (`lib/integrations/anaf.ts`): wraps ANAF's public OpenAPI. Returns `{name, legal_name, address, city, vat_payer, found}` for prefill. Falls back to manual entry on outage.
- **eFactura** (`lib/integrations/efactura.ts`, Phase 2c): gateway-mediated SPV XML submission. Gateway choice deferred to procurement; the integration boundary is small (create-invoice + poll-status).
- **VAT (TVA)**: `companies.vat_payer` flag. VAT-payer companies see 19% TVA line; non-VAT-payer don't. Stored at invoice time; rate changes don't retroactively rewrite invoices.
- **Locales**: every new consumer surface + email template ships in RO + EN, matching `2026-05-12-gdpr-legal-pages-design.md` pattern.

### Consumer-side discovery

- `filter-context.tsx` gains `filters.capabilities: ("events"|"meetings"|"standing"|"corporate_meals")[]`.
- New pill in `filter-pill-bar.tsx`.
- `/api/restaurants?capability=events` filters server-side in `restaurants-repo.ts`.
- Capability landing pages `/[city]/events` and `/[city]/meeting-nooks` with SEO copy, `sitemap.ts` entries, `LocalBusiness` structured data + `amenityFeature`.
- Card-level capability badge appears only on capability-filtered listings (avoids unfiltered-listing clutter).
- Venue detail page: subtle capability chips below restaurant name when ≥1 enabled.

### Partner-side conflict surfacing

When a partner opens an event-request detail view, the system queries overlapping reservations and standing-series occurrences for that date/time and shows ⚠ banners. Cheap real-time query; cuts down on accept-then-realize-overlap surprises.

### Notifications

- **Email**: primary channel, per-state-transition, RO + EN templates.
- **In-app partner**: `partner_notifications` table + `PartnerNotificationBell` in `PartnerShell`. Polled, not realtime, for v1. Useful from Phase 1 (new event request).
- **SMS**: deferred (could land for standing reminders eventually).

### Restaurant suspension cascade

`restaurants.status='suspended'` triggers (atomically in one transaction or background job, idempotent):
- All open `event_requests` for that restaurant → `cancelled` with reason "venue_suspended". Email both sides.
- All future-dated standing-series materializations → cancelled. Email consumer; pause the series (admin can resume).
- All future `meeting_bookings` → cancelled + Stripe refund. Email consumer.
- `events_intake_enabled`, `accepts_corporate_meals`, `accepts_standing` flipped false; `meeting_spaces.is_active` flipped false.

### GDPR / PII

`companies`, `company_members`, `event_requests`, `meeting_bookings` all carry PII. Existing data-export + data-deletion mailto-handled endpoints (per `2026-05-12-gdpr-legal-pages-design.md`) need new collection-by-collection branches. Audit log of edits to `companies` billing details — implemented as a generic `company_audit_events` table with `(company_id, user_id, action, before, after, created_at)`.

### Testing strategy

- **Unit**: every state machine; CUI validation; RRULE expansion edge cases (DST, month boundaries); Stripe webhook idempotency; availability_exception resolution.
- **Integration**: per-phase happy-paths in Jest with the existing Drizzle test harness.
- **RLS**: every new table gets policies + fixtures, mirroring existing `__tests__/rls/*` pattern.
- **Email**: RO + EN snapshot tests per template.
- **Playwright E2E**: happy-path per phase against the standing test partner account on tavli.ro. Phase 4 needs Stripe test mode wired in CI.

## Migration plan

```
0008_corporate_foundations.sql
  -- enums: company_status, company_member_role, event_occasion,
  --        event_request_status, booking_type, standing_status,
  --        meeting_booking_status, payment_status, invoice_status
  -- tables: companies, company_members, company_invitations,
  --         event_requests, restaurant_event_settings,
  --         availability_exceptions, partner_notifications
  -- column adds on restaurants and reservations
  -- RLS policies for all of the above

0009_standing_series.sql              -- Phase 3
0010_meeting_spaces_and_payments.sql  -- Phase 4
0011_corporate_invoices.sql           -- Phase 2c
0012_approvals.sql                    -- Phase 2d (reservation_status += pending_approval)
```

Each migration is small, independent, RLS-tested. Per project memory `deploy_setup.md`, migrations follow the manual 3-step bookkeeping convention.

## Phase ordering & rough sizing

1. **Phase 1: Private events** — 4–6 wks. Unlocks capability model, `companies` table (claim-only), event_requests, availability_exceptions, partner_notifications, account-at-submit auth.
2. **Phase 2a: Companies foundation** — 2–3 wks. Dashboard, members, invitations, CUI-claim reconciliation. Tables already exist from Phase 1.
3. **Phase 2b: Corporate-meal flag** — ~1 wk. Just `BookingTypeChips` on `ReservationSheet` + partner-side filter/badge.
4. **Phase 3: Standing** — 3–4 wks. RRULE + materialization cron.
5. **Phase 4: Meeting nooks** — 3–4 wks. First Stripe integration.
6. **Phase 2c: Invoicing/eFactura** — 3–4 wks. Procurement-blocked on gateway choice. Can run parallel to 3/4.
7. **Phase 2d: Approvals/budgets** — ~2 wks. Lowest priority.

Total ≈ 5–6 months at 1-eng pace, faster in parallel. Each phase is independently shippable.

## Risks

1. **Partner adoption gap.** If venues don't opt in, capability landing pages will be empty. GTM problem, but engineering helps with onboarding nudges in the partner dashboard (Phase 1 stretch).
2. **eFactura is mandatory by law.** Companies booking corporate-meals will expect invoices. If Phase 2c lags too far behind 2a/2b, corporate-accounts feels half-built. Worth pulling 2c earlier or partnering with a bookkeeper during beta.
3. **Standing-series materialization race conditions.** Need explicit per-slot reservation insert protection (unique constraint on `(restaurant_id, reservation_date, reservation_time, zone)` for non-cancelled rows, OR per-restaurant advisory lock around the cron). Existing `availability` doesn't enforce capacity at insert; Phase 3 must harden this.
4. **CUI verification is async + manual fallback.** Admin queue could become a chokepoint. Measure volume early; auto-approve heuristic if ANAF lookup confirms name match (Phase 2a stretch).
5. **CUI claim hijacking.** Adversarial: Alice submits anonymous event request claiming a CUI she doesn't own. The real owner later signs up and finds in-flight requests. Mitigation: claim-only model (no auto-`companies` row); pre-attachment requires owner-signup; admin can reject mismatched claims; rate-limit by IP on event-request submissions.
6. **Whole-venue events that exceed availability exceptions.** A 200-person buyout for a 100-cover venue must mean the dining grid is fully closed. If a partner accidentally materializes only a `private_event` row without the corresponding exceptions, regular bookings could double-book. Mitigation: the materialization UI defaults to private-room safe path; whole-venue requires explicit affirmative choice.
7. **Auth-context refresh inside `ReservationSheet`.** Naive auth provider rerenders blow away form state. Phase 2b must explicitly handle this; otherwise sign-in-mid-flow is a regression.
8. **Stripe outage during meeting booking.** Payment fails → booking not confirmed → consumer holds expectation. Webhook idempotency + retry logic + clear "payment failed, please retry" UX. Stripe-side incidents are unavoidable but recoverable.

## Open questions (to surface in implementation-plan phase, not blocking)

- eFactura gateway selection (SmartBill vs Oblio vs FGO vs direct ANAF integration).
- Stripe Connect vs platform-as-merchant model for meeting nooks.
- Exact pricing model for Pro plan (subscription tier vs commission).
- Whether to ship the "Suggest a venue" demand-gen surface in Phase 1 or defer to v1.1.
- Mobile app updates for corporate flows (existing platform has iOS+Android per overview; out of scope for engineering spec but a real launch dependency).

---

**Next:** user reviews this spec. On approval, transition to `writing-plans` skill to produce an implementation plan starting with Phase 1.
