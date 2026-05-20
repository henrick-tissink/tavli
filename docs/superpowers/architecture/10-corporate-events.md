# 10 — Corporate Events

> Private-room bookings, group dining, buyouts, and the inbound corporate-events lead-routing motion. Phase 1.0 in production; Phase 1.5 merged + pushed 2026-05-18, awaits Coolify redeploy as of 2026-05-20. The data model below reflects what's in `main` HEAD. Verify against `git log` before extending. This doc covers the remaining build: invoice PDF generation, the lead-routing engine, and the corporate-events landing page on `tavli.ro`. (Stripe Connect deposits — deferred to v1.5 per §6.)

**Dependencies:** last verified compatible with `00-foundations.md` 2026-05-20. Re-check on foundations contract changes — specifically §2 (Cloudflare Turnstile locked in stack), §3.2 `ActionResult<T>`, §3.4 `can()`/`requireCan()`, §6.5 transactional-vs-marketing email split, §11.4 templates per-locale storage, §16.1 ERROR_CODES (TV800–TV899 owned here, including TV801/802/803), §16.2 AUDIT (`AUDIT.organization.*` for corporate flows). Cross-doc: §01 open question 8 renamed `companies` → `corporate_clients` (and the two adjacent membership/invitation tables) in the same migration that adds `organizations`; this doc uses the renamed tables throughout.

## Contents

- [1. Scope](#1-scope)
- [2. Current state](#2-current-state)
- [3. Architectural pillars](#3-architectural-pillars) — two identities, anonymous-vs-attached, lead fan-out, Stripe Connect (v1.5)
- [4. Data model](#4-data-model) — `corporate_lead_intents`, `event_requests` mods, attachments, Stripe accounts, invoice sequence
- [5. Inbound lead routing](#5-inbound-lead-routing) — public inquiry, matching algorithm, response nudge cron, manual search expansion, expiry cleanup
- [6. Stripe Connect onboarding](#6-stripe-connect-onboarding--deferred-to-v15) — DEFERRED v1.5; v1 deposit guard + bank-transfer flow
- [7. Invoice + quote PDF generation](#7-invoice--quote-pdf-generation)
- [8. UI surfaces](#8-ui-surfaces)
- [9. Background jobs](#9-background-jobs)
- [10. Compliance & audit](#10-compliance--audit)
- [11. Build sequence](#11-build-sequence)
- [12. Open questions](#12-open-questions)
- [13. Cross-references](#13-cross-references)

## 1. Scope

This domain owns: the negotiation-and-quote lifecycle for private/group events, the inbound lead-routing engine that fans corporate inquiries to opt-in Pro venues, the corporate buyer experience (browse → inquire → negotiate → confirm), Stripe Connect deposits collected at booking, and the invoice PDF pipeline.

It does **not** own: the restaurant-side legal entity (→ §01 `organizations`) — `corporate_clients` here is the *corporate buyer's* legal entity, structurally distinct from `organizations`. Standard bookings (single-party reservations) live in §02.

### Checkboxes covered

Status markers per README: `[ ]` = unshipped, `[x]` = shipped. Inline notes flag partial / deferred state.

From LFC §2 Tavli Pro:
- [x] Corporate events module *(Phase 1.5 merged + pushed 2026-05-18; awaits Coolify redeploy as of 2026-05-20)*
- [x] Multi-room availability + buyout module *(foundation shipped; surface UX polish ongoing)*
- [x] Custom event-request flow with capacity rules *(shipped)*
- [x] Event-specific terms + lead-time minimums *(shipped — `restaurant_event_settings`)*
- [ ] Inbound corporate-events lead routing (operational + UX)
- [ ] Invoiceable line items + invoice PDF generation *(line items shipped, PDFs in build step 9-10; "coming soon" label until shipped)*
- [ ] Stripe deposits at booking via Stripe Connect *(**DEFERRED to v1.5** per §6 — v1: restaurants invoice + collect deposits manually via bank transfer using Tavli-generated invoice PDFs)*

## 2. Current state

Confirmed via Phase 1.0 + 1.5 work (migrations 0008/0009/0010 — Phase 1.5 commits on `main` HEAD as of 2026-05-20; pre-redeploy. Verify against `git log` before extending):

**Exists:**
- `corporate_clients` table (renamed from `companies` per §01 §14 open question 8) — corporate buyer legal entity (CUI unique, billing fields, VAT, status).
- `corporate_client_members` (renamed from `company_members`) — corporate team (owner/admin/booker/viewer).
- `corporate_client_invitations` (renamed from `company_invitations`) — claim flow for team additions.
- `event_requests` — full negotiation lifecycle (status enum: draft / new / viewing / replied / quoted / accepted / declined / expired_quote / cancelled / expired / completed).
- `restaurant_event_settings` — per-venue policy (min/max party, lead-time min, accepted occasions, budget guidance, auto-reply, blackout dates).
- `restaurant_private_spaces` — inventory of rooms (capacity range, photo, sort order).
- `event_request_quote_line_items` — itemised quote breakdown.
- `availability_exceptions` — sourced from event-request-driven blackouts.
- `partner_notifications` — kind: `event_request.new` etc.
- `EventRequestAcceptedEmail` template (RO only).
- Tracking-token deep link for corporate buyer's status page.

**Missing in v1 — needs build:**
- Inbound lead routing — there's a `claimed_company_cui` field on `event_requests` (so an anonymous inquiry can be claimed by an existing company), but no automated matching of inquiry → candidate restaurants.
- Corporate-events landing page on `tavli.ro` (the public surface where buyers browse + inquire).
- Invoice PDF generation (today's quotes are CSV/line-items only).
- Quote-PDF generation (similar but for the proposal stage).
- Multi-restaurant inquiry: a buyer can request quotes from multiple venues for the same event (e.g., "need a place for 80 people in Bucharest" → fans out to 5 candidate venues).
- Lead-routing nudge mechanics (currently `last_nudge_at` exists but the cron is partial).
- Trilingual templates for buyer-facing emails (currently RO).

**Missing in v1 (DEFERRED v1.5):**
- Stripe Connect onboarding for restaurants.
- Deposit-handling UI (collection at booking).
- Payment-status webhooks (charge.succeeded / charge.refunded handling).

## 3. Architectural pillars

### 3.1 Two adjacent identities: `corporate_clients` (buyer) vs `organizations` (seller)

These are distinct tables, distinct roles, no merge. A given LLC could be both (an LLC that owns a restaurant AND has employees who book at other restaurants) — two rows in two tables sharing `tax_id`. Per §01 §14 open question 8 (which renamed the prior `companies` table to `corporate_clients` so the conceptual distinction is also a naming distinction; no engineer will reach for the wrong table).

### 3.2 An inquiry can be either anonymous or attached

- **Anonymous inquiry**: the buyer hasn't logged in. Captures `claimed_company_cui` + name. Buyer gets a tracking-token URL to monitor status. They can later claim the inquiry by signing up.
- **Attached inquiry**: a `corporate_client_members` user submits while logged in — `corporate_client_id` is set on the request, the buyer can see it in their corporate dashboard.

Both flow through the same negotiation lifecycle.

### 3.3 Lead routing fans out, then narrows

A single inquiry "I need a venue for 80 people in Bucharest" creates ONE `event_requests` row in the simplest implementation. To support multi-restaurant fan-out, we add a parent-child relationship: a `corporate_lead` (the buyer-side intent) spawns one `event_requests` per matched restaurant. As restaurants respond, the buyer compares.

For v1, recommendation: keep it simple — one `event_requests` per buyer-restaurant pair. The buyer can submit the same intent to multiple restaurants; each gets its own `event_requests` row. A `lead_intent_id` foreign key groups them for the buyer's dashboard.

### 3.4 Stripe Connect, not platform-managed deposits

When a deposit is collected, the money goes to the **restaurant's** Stripe Connect account, not Tavli's. Tavli holds zero funds for events. Regulatory cleanness — Tavli is software, not a payment processor.

## 4. Data model

### 4.1 New table: `corporate_lead_intents`

Buyer-side intent that may fan out to multiple `event_requests`.

```sql
create table corporate_lead_intents (
  id uuid primary key default gen_random_uuid(),

  -- Buyer
  requester_user_id uuid references auth.users(id) on delete set null,
  claimed_company_cui varchar(60),                           -- nullable for fully-anonymous
  claimed_company_name varchar(300),
  corporate_client_id uuid references corporate_clients(id) on delete set null,  -- if/when attached

  guest_name varchar(120),
  guest_email varchar(255),
  guest_phone varchar(20),

  -- Buyer-side locale (per foundations §11.4 templates-per-locale; drives lead matching + email language)
  event_preferred_locale char(2) not null default 'ro',       -- 'ro' | 'en' | 'de'
  search_expanded_count integer not null default 0,           -- cap at 1 expansion; see §5.3

  -- The event
  occasion varchar(40),                                       -- enum: see existing event_requests
  event_date date,
  event_date_flexibility varchar(20),                        -- 'fixed' | 'window_1week' | 'window_1month'
  event_time_preference varchar(60),                         -- "evening", "lunch", or "19:00"
  party_size_min smallint,
  party_size_max smallint,
  city_id uuid references cities(id) on delete set null,
  cuisine_preferences text[] not null default '{}',
  space_preference varchar(40),                              -- "private_room", "buyout", "semi_private"
  budget_per_head_min_cents integer,
  budget_per_head_max_cents integer,
  additional_notes text,

  -- Status
  status varchar(20) not null default 'open',                -- 'open' | 'quoted' | 'booked' | 'closed' | 'expired'
  closed_reason varchar(40),                                  -- 'booked_with_restaurant' | 'cancelled_by_buyer' | 'no_response' | 'budget_mismatch'

  tracking_token varchar(60) not null unique,                -- public deep link

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index corporate_lead_intents_status on corporate_lead_intents (status) where status = 'open';
create index corporate_lead_intents_city on corporate_lead_intents (city_id, event_date) where status = 'open';
create index corporate_lead_intents_token on corporate_lead_intents (tracking_token);

-- RLS: tracking token is public auth via the /events/[token] route (no logged-in user).
-- Authenticated reads (corporate dashboard) check corporate_client_id membership.
alter table corporate_lead_intents enable row level security;

create policy "corporate_lead_intents_member_select" on corporate_lead_intents
  for select using (
    corporate_client_id in (
      select corporate_client_id from corporate_client_members
      where user_id = auth.uid()
    )
    or requester_user_id = auth.uid()
  );

-- Inserts (anonymous submission via the inquiry form) + status mutations are service-role only.
```

### 4.2 Modifications to `event_requests`

```sql
alter table event_requests
  add column lead_intent_id uuid references corporate_lead_intents(id) on delete set null,
  add column match_score numeric(5, 2),                       -- 0–100; how well the inquiry matches the venue's settings
  add column response_time_target_at timestamptz,             -- "respond by X" — used for nudge cron
  add column deposit_required_cents integer,                  -- if non-zero, deposit must be collected before status='confirmed'
  add column deposit_status varchar(20),                       -- 'not_required' | 'pending' | 'paid' | 'refunded'
  add column stripe_payment_intent_id varchar(80),
  add column quote_pdf_path text,                              -- when status moves to 'quoted'; storage bucket reference
  add column invoice_pdf_path text;                            -- post-confirmation; storage bucket reference
```

### 4.3 New table: `event_quote_attachments`

PDFs and supplementary docs attached to a quote.

```sql
create table event_quote_attachments (
  id uuid primary key default gen_random_uuid(),
  event_request_id uuid not null references event_requests(id) on delete cascade,
  storage_path text not null,
  file_name varchar(200) not null,
  file_size_bytes bigint not null,
  mime_type varchar(80) not null,
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create index event_quote_attachments_event on event_quote_attachments (event_request_id);

-- RLS: standard org-member read; org-admin + venue-owner write.
alter table event_quote_attachments enable row level security;

create policy "event_quote_attachments_select" on event_quote_attachments
  for select using (
    event_request_id in (
      select id from event_requests
      where restaurant_id in (
        select id from restaurants
        where organization_id in (
          select organization_id from organization_members
          where user_id = auth.uid() and is_active = true
        )
      )
    )
  );
-- Inserts via service action; same membership constraint enforced application-side via can(...).
```

### 4.4 New table: `restaurant_stripe_accounts`

Per-restaurant Connect account state. (Could live on `restaurants` directly, but a separate table keeps the auth surface clean.)

```sql
create table restaurant_stripe_accounts (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,
  stripe_connect_account_id varchar(80) not null unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  onboarding_status varchar(20) not null default 'incomplete',   -- 'incomplete' | 'pending_verification' | 'active' | 'restricted'
  onboarding_url_expires_at timestamptz,
  last_synced_at timestamptz,
  capabilities jsonb not null default '{}'::jsonb,                 -- raw Stripe capability flags
  requirements jsonb not null default '{}'::jsonb,                 -- pending requirements from Stripe
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index restaurant_stripe_accounts_status on restaurant_stripe_accounts (onboarding_status);

-- RLS: only venue-owners + org-admins can see their own restaurant's Stripe-account state. Service role manages writes via webhook handlers.
alter table restaurant_stripe_accounts enable row level security;

create policy "restaurant_stripe_accounts_admin_select" on restaurant_stripe_accounts
  for select using (
    restaurant_id in (
      select id from restaurants
      where organization_id in (
        select organization_id from organization_members
        where user_id = auth.uid() and is_active = true and role in ('owner', 'admin')
      )
    )
  );

-- Same RLS-by-template for restaurant_invoice_sequence (admin-only read; service-role write):
alter table restaurant_invoice_sequence enable row level security;
create policy "restaurant_invoice_sequence_admin_select" on restaurant_invoice_sequence
  for select using (
    restaurant_id in (
      select id from restaurants
      where organization_id in (
        select organization_id from organization_members
        where user_id = auth.uid() and is_active = true and role in ('owner', 'admin')
      )
    )
  );
```

## 5. Inbound lead routing

### 5.1 Public inquiry form (`tavli.ro/events/inquire`)

The corporate-events landing page (per §15) has a CTA → the inquiry form. Fields:
- Occasion, date(s) with flexibility, time, party size, city, cuisine preferences, space preference, budget range, notes.
- Buyer identity: name, email, phone, optional company name + CUI.
- Captcha — Cloudflare Turnstile (locked in foundations §2 stack snapshot; ships day one — no conditional fallback).

Submit creates a `corporate_lead_intents` row with `status = 'open'`.

### 5.2 Matching algorithm

`matchLeadToRestaurants(leadIntentId)` job runs immediately after creation. Returns ranked candidates:

1. Filter restaurants by:
   - **Tier gate (defence-in-depth):** `loadActiveSubscription(organization_id)` returns `tier = 'pro'` and `status in ('active', 'trialing')`. Defence-in-depth means the UI gate isn't the only protection — a Base org couldn't toggle `events_intake_enabled` and start receiving leads.
   - `events_intake_enabled = true` on the restaurant.
   - `restaurants.city_id = leadIntent.city_id` (or in lookup-of-nearby cities for "any in greater Bucharest").
   - `restaurant_event_settings.min_party_size ≤ leadIntent.party_size_max`.
   - `restaurant_event_settings.max_party_size ≥ leadIntent.party_size_min`.
   - `leadIntent.occasion` ∈ `restaurant_event_settings.accepted_occasions` (or settings has empty array = accepts all).
   - `leadIntent.event_date - now() ≥ restaurant_event_settings.min_lead_days`.
   - `event_date NOT IN restaurant_event_settings.blackout_dates`.
   - No conflicting confirmed event in `event_requests` for the same date.
   - **Locale match (per foundations §11.4):** `leadIntent.event_preferred_locale = ANY(restaurant_event_settings.supported_locales)`. Restaurants without explicit locale support are matched only when `event_preferred_locale = 'ro'` (the default-locale fallback). `restaurant_event_settings.supported_locales char(2)[]` is added in the same migration as the `corporate_lead_intents` table.

2. Score each candidate (0–100):
   - +40 if cuisine_preferences ∩ restaurants.cuisines ≠ ∅.
   - +25 if `budget_per_head_max_cents ≥ restaurant_event_settings.budget_per_head_guidance_cents`. *(Column reference: `restaurant_event_settings.budget_per_head_guidance_cents integer` — already exists in Phase 1.5 schema per migration 0009; if any pre-Phase-1.5 environment lacks it, add via migration `00NN_event_settings_budget_guidance.sql` ordered BEFORE the lead-routing matcher ships. Verify against the current `restaurant_event_settings` definition before building.)*
   - +15 if `space_preference` matches a `restaurant_private_spaces` row's capacity range.
   - +10 if response_rate_last_30d > 0.8 (restaurant has been responsive).
   - +10 if avg_response_time_hours < 24 (restaurant has been quick).
   - −20 if currently 2+ open `event_requests` (busy).

3. Take top 5. If fewer than 3, expand `city_id` to nearby.

4. Fan out: for each top-5 candidate, create an `event_requests` row with `lead_intent_id`, `match_score`, `status = 'new'`, `response_time_target_at = now() + interval '24 hours'`.

5. For each created event_request, send `partner_notifications` (kind: `event_request.new`) + email to the venue's `org_admin` + `venue_manager` + `venue_owner` roles per §01 matrix.

6. Send buyer a "We've sent your inquiry to N candidate venues — you'll hear back within 24h" email.

### 5.3 Response nudge cron

`corporate.lead-routing-nudge` (pg-boss recurring, every 4h):

- For every `event_requests` with `status = 'new'` + `response_time_target_at < now() - interval '4 hours'`:
  - Send a nudge email + partner_notification to the restaurant.
  - If still no response 12h after target: notify buyer that this venue hasn't replied; offer to expand the search.
  - If still no response 36h after target: auto-mark the event_request as `expired`; surface to admin if pattern across multiple events at the same venue (signals an inactive venue).

**Manual search expansion (buyer-driven).** When the buyer clicks "broaden my search" on the tracking page (`/events/[token]`):
1. Increment `corporate_lead_intents.search_expanded_count` (capped at 1 in v1 — a single expansion only; further expansions need operator intervention).
2. Re-run `matchLeadToRestaurants` with city-radius widened by +25km (joins `cities` with a geo radius helper).
3. Fan out additional `event_requests` for any newly-matched venues. Do not duplicate venues already notified.
4. If `search_expanded_count >= 1` the button on the tracking page reads "Search already broadened" (disabled).

### 5.4 Expiry + cleanup

`corporate.expire-stale-leads` (nightly):
- `corporate_lead_intents` with no confirmed `event_requests` after 30 days → `status = 'expired'`.
- Send buyer a final "your inquiry has expired — try again or contact us" email. Send via `sendTransactionalEmail` (§04); this is NOT marketing — it is an operational obligation tied to a buyer-initiated request, so it bypasses marketing consent / suppression / frequency-cap checks (per foundations §6.5 marketing-vs-transactional split).

## 6. Stripe Connect onboarding — DEFERRED to v1.5

**Pre-release decision (locked):** v1 ships without Stripe Connect. Restaurants invoice corporate clients manually via bank transfer; the Tavli-generated invoice PDF (still ships in v1, per §7) carries the restaurant's bank details. Saves ~4 days of build for a feature with zero v1 customers (no corporate events scheduled yet).

The `event_requests.deposit_*` columns + `restaurant_stripe_accounts` table still ship in v1's schema (no harm; small) so the v1.5 Stripe Connect work doesn't require a migration. `event_requests.deposit_status` stays `'not_required'` for every event in v1.

**Application-layer guard in `confirmEventBooking`:** because the `deposit_required_cents` column ships in v1 but cannot be activated without Connect, the booking action must refuse to confirm any event with a non-zero deposit until Connect is set up:

```ts
if (settings.deposit_required_default_cents > 0
    && !(await db.query.restaurantStripeAccounts.findFirst({
         where: eq(restaurantStripeAccounts.restaurantId, restaurantId)
       }))) {
  return fail('TV803', 'deposits require Stripe Connect setup, coming in v1.5');
}
```

`TV803` is registered in foundations §16.1 ERROR_CODES (deposit-gating, pre-Connect). This guard ensures a v1 venue can't accidentally promise a deposit on a quote with no path to collect it. Section retained below for v1.5 reference.

### 6.1 Flow (v1.5)

Triggered when a restaurant first toggles "Require deposit on event bookings" in `restaurant_event_settings`. Sets up the Connect account if not yet done:

1. Server action `connectStripeAccount(restaurantId)`:
   - `can(session, 'billing.update', { kind: 'restaurant', id: restaurantId })`.
   - Create a Stripe Connect Standard account: `stripe.accounts.create({ type: 'standard', country: 'RO', email: restaurant.email, business_type: 'company' })`.
   - Persist `stripe_connect_account_id` in `restaurant_stripe_accounts`.
   - Generate an account-onboarding link: `stripe.accountLinks.create({ account, type: 'account_onboarding', refresh_url, return_url })`.
   - Store `onboarding_url_expires_at`.
   - Return the URL; redirect the restaurant owner to it.

2. Restaurant completes Stripe's onboarding (provides business details, bank account, etc.) — entirely on Stripe's hosted pages.

3. Stripe redirects back to `/partner/restaurants/[id]/billing/connect/return`.

4. Webhook `/api/webhooks/stripe-connect/route.ts` listens for `account.updated` events; updates `charges_enabled`, `payouts_enabled`, `onboarding_status`, `capabilities`, `requirements`.

### 6.2 Standard vs Express vs Custom

Stripe Connect has 3 modes. Recommendation: **Standard**.
- **Standard**: restaurant has their own full Stripe dashboard, owns the relationship. Best for restaurants who want to manage refunds/disputes themselves. Aligns with the "you own your data" promise.
- **Express**: Tavli-branded onboarding but Stripe-managed. More integrated but more responsibility on Tavli for compliance.
- **Custom**: Tavli is the merchant of record. Most regulatory exposure. Not chosen.

Standard wins on simplicity + regulatory clarity.

### 6.3 Deposit collection

When a restaurant sends a quote with `deposit_required_cents > 0`:

1. Buyer accepts the quote at `/events/[token]/accept`.
2. Server action `confirmEventBooking(eventRequestId)`:
   - Creates a Stripe PaymentIntent on the restaurant's connect account:
     ```ts
     stripe.paymentIntents.create({
       amount: deposit_required_cents,
       currency: 'ron',
       payment_method_types: ['card'],
       application_fee_amount: 0,                              // Tavli takes no cut — pure pass-through
       transfer_data: { destination: stripeConnectAccountId },
     })
     ```
   - Returns the `client_secret` to the buyer.
3. Buyer enters card via Stripe Elements (in the buyer-facing page).
4. On success, webhook updates `event_requests.deposit_status = 'paid'` + sets `status = 'completed'` (or `confirmed`).
5. If the event is cancelled within the refundable window (per `restaurant_event_settings.deposit_refundable_until_days` — new column), restaurant can issue a refund via the buyer-facing or restaurant-facing UI. Stripe handles the refund through the same Connect account.

### 6.4 The "coming soon" launch

Per `launch-feature-commitments.md` §5: deposits at booking can launch with a "coming soon" label. Until Stripe Connect is integrated, the restaurant invoices the buyer externally (bank transfer with the invoice PDF Tavli generates). The data model supports both paths from day one (`deposit_status` can stay `'not_required'`).

## 7. Invoice + quote PDF generation

### 7.1 Templates

Two PDF templates rendered server-side:
- **Quote PDF** — sent when restaurant moves an event_request to `'quoted'` status. Contains: header (restaurant logo + legal info), buyer name/company, event details, line items (from `event_request_quote_line_items`), total, validity period, terms, restaurant signature line.
- **Invoice PDF** — sent post-event when restaurant marks `'completed'`. Same shape as quote but final, with VAT calc, invoice number, payment instructions or "PAID" stamp if deposit was collected.

### 7.2 Generation pipeline

`pdf-lib@1.x` (chosen in §05 §12 Tools & libraries) for both. Templates live in `src/pdf/QuotePdf.ts` and `src/pdf/InvoicePdf.ts` — functional renderers (not React components, since pdf-lib doesn't render React).

```ts
async function generateQuotePdf(eventRequestId: string): Promise<{ storagePath: string }>
```

1. Load event_request + line items + restaurant + buyer.
2. Render PDF in restaurant's locale.
3. Save to `event-pdfs` storage bucket: `quotes/<event_request_id>/<version>.pdf`.
4. Update `event_requests.quote_pdf_path` (new column).
5. Return signed URL for download.

### 7.3 Invoice numbering

Sequence per-restaurant per-year. Romanian B2B invoicing requires gapless sequential numbers. New table:

```sql
create table restaurant_invoice_sequence (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  year smallint not null,
  next_number integer not null default 1,
  primary key (restaurant_id, year)
);
```

Reserve the next number in a transaction; if PDF generation fails, the number is consumed regardless. Per RO accounting rules, the sequence MUST have no gaps — once `next_number` advances, it never goes back. If the PDF render fails after the number is reserved, the number is *consumed*: the bookkeeping is reconciled by recording it as voided rather than skipped. Reconciliation table `invoice_voided_numbers (restaurant_id, year, number, voided_reason, voided_at)` lands in v1.5; for v1, a Sentry alert + manual ANAF notation is acceptable (volume will be ≤1 per restaurant per month at most).

### 7.4 ANAF e-invoicing

`corporate_clients.efactura_enabled` already exists on the buyer side. Restaurants needing e-Invoice submission to ANAF (the Romanian tax authority) is a v1.5 feature — integrate via the ANAF API after launch. For now, restaurants can manually upload to the ANAF portal using the generated PDF.

## 8. UI surfaces

### 8.1 Public corporate-events landing (`tavli.ro/events`)

Editorial page. Hero + value props + "Inquire" CTA + showcase of partner venues with private spaces.

### 8.2 Inquiry form (`tavli.ro/events/inquire`)

Multi-step (party + date / occasion + venue prefs / contact details). After submit: a confirmation page + email to the buyer with the tracking-token URL.

### 8.3 Buyer tracking page (`/events/[token]`)

- Shows status of the lead intent + each fanned-out `event_requests`.
- For each candidate venue: name, image, capacity match, current status (Replied / Quoted / Awaiting).
- "Accept quote" CTA when a quote is ready.
- "Withdraw inquiry" CTA.
- Card-on-file input (Stripe Elements) when a quote with deposit requirement is accepted.

### 8.4 Buyer corporate dashboard (`/corporate/[companyId]`)

For logged-in `corporate_client_members`. Shows all past + active inquiries, total spend, frequent venues.

### 8.5 Restaurant event-requests inbox (`/partner/restaurants/[id]/event-requests`)

Already partially exists per the shipped Phase 1.5 work. Surfaces:
- Pending new inquiries (status='new').
- Active negotiations (status='viewing'/'replied'/'quoted').
- Past completed.
- For each: detail sheet — buyer info, event details, send-quote flow, line-item builder, attach-PDF, set deposit requirement.

### 8.6 Restaurant event-settings page (`/partner/restaurants/[id]/event-settings`)

Already exists. Extend with deposit fields (`deposit_required_default_cents`, `deposit_refundable_until_days`).

## 9. Background jobs

| Job | Trigger / schedule | Purpose |
|---|---|---|
| `corporate.match-lead-to-restaurants` | on lead intent creation | Fan-out to candidate venues. |
| `corporate.lead-routing-nudge` | every 4h | Send response nudges + auto-escalate stale leads. |
| `corporate.expire-stale-leads` | nightly | Mark dead inquiries as expired; notify buyer. |
| `corporate.expire-quote-windows` | nightly | `event_requests.status='quoted'` past `quote_expires_at` → `status='expired_quote'`. |
| `corporate.send-quote-pdf` | on quote send action | Render + upload + email PDF to buyer. |
| `corporate.send-invoice-pdf` | on completion | Same for invoice. |
| `corporate.sync-stripe-connect-status` | webhook + daily reconcile | Keep `restaurant_stripe_accounts` fresh. |

## 10. Compliance & audit

- Every quote send writes `audit_logs: 'event.quote_sent'` with line-item snapshot.
- Every deposit charge writes `audit_logs: 'event.deposit_collected'`.
- Every refund writes `audit_logs: 'event.deposit_refunded'`.
- Invoice sequence integrity is auditable: a query verifies no gaps per restaurant per year.
- Stripe Connect's hosted onboarding handles KYC/AML — Tavli stores only the account ID + status flags, not bank details.

## 11. Build sequence

1. **`corporate_lead_intents` table + RLS + tracking_token uniqueness.** *(0.5 day)*
2. **`event_requests` column extensions** (lead_intent_id, match_score, response_time_target_at, deposit_*, stripe_payment_intent_id, quote_pdf_path, invoice_pdf_path). *(0.3 day)*
3. **`event_quote_attachments` + `restaurant_stripe_accounts` + `restaurant_invoice_sequence` tables.** *(0.5 day)*
4. **Trilingual i18n scaffolding** (buyer emails, quote/invoice PDF labels, status names). Hard dependency on foundations §11 i18n + §11.4 templates-per-locale storage being landed; this step is blocked until §00 §11 ships. *(1 day)*
5. **Public inquiry form + landing page.** *(2 days)*
6. **`matchLeadToRestaurants` matching algorithm + scoring.** *(2 days)*
7. **Buyer tracking page** (`/events/[token]`) with fan-out comparison view. *(2 days)*
8. **Restaurant event-requests inbox extensions** — quote builder + line-item editor + attach PDF. *(2 days)*
9. **Quote PDF generator** + storage upload + buyer email (uses trilingual labels from step 4). *(1.5 days)*
10. **Invoice PDF generator** + sequence reservation + send (uses same trilingual labels). *(1.5 days)*
11. ~~Stripe Connect onboarding~~ — DEFERRED v1.5 per §6.
12. ~~Deposit collection~~ — DEFERRED v1.5.
13. ~~Refund flow~~ — DEFERRED v1.5. Total v1 saving: ~5 days from this domain.
14. **`corporate.lead-routing-nudge` + `corporate.expire-stale-leads` + `corporate.expire-quote-windows` jobs.** *(1 day)*
15. **Corporate dashboard for buyers** (`/corporate/[companyId]`) — list of inquiries, status overview. *(1.5 days)*
16. **"Coming soon" labels** on deposit + e-Invoicing CTAs in the inbox UI when not configured. *(0.3 day)*

Build-sequence note: i18n scaffolding (step 4) is now ahead of the PDF generators (steps 9–10) so PDFs are trilingual from first render — avoiding a regenerate-after-translate pass.

**Total: ~16 working days** for v1 (with Stripe Connect + deposit + refund deferred per §6, steps 11–13 ≈ 5 days saved). Heaviest pieces: matching algorithm (step 6), PDF generators (steps 9–10), buyer tracking page (step 7). This is a substantial domain but not the largest in the spec; §11 (marketing suite) is the largest by line count and total build time.

## 12. Open questions

1. **Buyer-side fan-out — show or hide that competitors are quoting?** Recommendation: show. Transparency builds trust + creates urgency for restaurants. Buyer sees "3 venues have replied, 2 still considering." Doesn't reveal *quote details* across venues.

2. **Tavli takes no cut on event deposits — is that the right model long-term?** Recommendation: yes for v1. The model is software-subscription + lead-gen, not transactional fees. Per spec: "No per-cover fees, ever." A deposit-take would feel like a backdoor per-cover fee. v2 can revisit with a "Tavli Premium" lead-gen tier.

3. **Lead-routing fan-out size**: 5 candidates is the v1 default. Recommendation: configurable per-buyer in the inquiry form ("send to up to N venues") with hard cap 10. Too many candidates fatigues restaurants.

4. **Quote validity period**: default `quote_expires_at` = `now() + 7 days`. Recommendation: configurable per-quote, default 7 days. Add explicit field in the quote builder UI.

5. **Should `event_requests` and standard `reservations` share UI surface in the partner inbox?** Recommendation: separate inboxes. Different semantics (negotiation vs confirmation), different SLAs (event = 24h response, reservation = immediate confirmation), different staff roles (events might be a manager-only domain, reservations all-staff).

6. **Capacity reservation during quote period**: if a restaurant has quoted a Saturday-evening buyout, should the system block standard bookings for that date until the quote resolves? Recommendation: yes, but **soft-block** — show staff a warning when they accept a competing booking; let them override with audit. `availability_exceptions` already supports this pattern.

7. **Restaurants that don't use Stripe Connect — full event flow without deposits?** Recommendation: yes. Deposit is optional per-restaurant + per-event. Restaurant invoices the buyer manually via bank transfer using the Invoice PDF; collection happens off-platform.

8. **e-Invoice (ANAF) integration in v1?** Recommendation: no. Restaurants can use the standalone ANAF portal manually. Tavli generates the PDF that's ANAF-compliant in format; the upload is operational. v1.5 to integrate the API.

9. **VAT calculation on the invoice PDF — TVA included or excluded?** Recommendation: per `corporate_clients.vat_payer`. Restaurants that are VAT-registered show "+ TVA"; non-VAT restaurants show all-in price. Add `restaurants.vat_payer` flag (default true for RO).

10. **Should buyer-side payment methods be saved for repeat bookings?** Recommendation: yes for logged-in `corporate_client_members`. Stripe Customer reused for subsequent deposits. Defer to v1.5; for launch, every deposit is a fresh card entry.

## 13. Cross-references

- **§00 Foundations** — Stripe SDK + webhooks, pg-boss for nudges + expiry, pdf-lib for PDF rendering, Resend for buyer emails.
- **§01 Identity & accounts** — `organizations` (seller) vs `corporate_clients` (buyer) distinction; `can()` matrix for `event_request.respond`, `event_request.quote`.
- **§02 Bookings** — when an event is confirmed, a `reservations` row may be created (`booking_type = 'private_event'`, `event_request_id` already exists).
- **§03 Diner database** — the buyer (`guest_email`, `guest_phone`) becomes a diner with `acquisition_source = 'corporate'`.
- **§04 Diner communication** — corporate-buyer transactional emails (inquiry received, quote ready, deposit paid, event reminder, post-event thank-you).
- **§05 Venue page** — `restaurant_private_spaces` photos feed the venue page's events section.
- **§07 Analytics & reports** — corporate revenue / lead conversion rate per venue; v1.5 metric.
- **§11 Marketing suite** — corporate-events campaigns (HR outreach is mostly operational, not in-product); the marketing-suite WhatsApp/SMS channels can target `corporate_client_members` opted in.
- **§12 Billing & subscriptions** — Stripe Connect set up here; the platform subscription (per-org) is separate from the Connect accounts (per-restaurant).
- **§13 Compliance & legal** — invoice sequence integrity; deposit refund records for ANPC audit.
- **§14 The setup** — per-restaurant onboarding wizard at `/partner/restaurants/[id]/onboarding` is where event-settings (private spaces, lead-time, accepted occasions) get first-configured.

---

*Last updated: 2026-05-20. Phase 1.5 merged + pushed 2026-05-18; awaits Coolify redeploy. Remaining v1 build ≈ 16 days (Stripe Connect deferred to v1.5).*
