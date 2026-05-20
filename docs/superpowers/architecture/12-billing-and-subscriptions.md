# 12 — Billing & Subscriptions

> Stripe-backed subscription billing for Tavli + Tavli Pro tiers. Card-on-file at signup, day-91 auto-conversion, monthly + annual billing modes, per-additional-location billing math, marketing-suite overage billing, pro-rata refund on annual prepay, one-click cancellation, one-trial-per-legal-entity enforcement.

## Contents

1. [Scope](#1-scope)
2. [Current state](#2-current-state)
3. [Architectural pillars](#3-architectural-pillars)
4. [Data model](#4-data-model)
5. [Stripe products + prices](#5-stripe-products--prices)
6. [Subscription state machine](#6-subscription-state-machine)
7. [Signup + trial start](#7-signup--trial-start)
8. [Per-additional-location billing](#8-per-additional-location-billing)
9. [Marketing overage billing](#9-marketing-overage-billing)
10. [Cancellation flow](#10-cancellation-flow)
11. [Dunning](#11-dunning)
12. [UI surfaces](#12-ui-surfaces)
13. [Background jobs](#13-background-jobs)
14. [Tools & libraries](#14-tools--libraries)
15. [Compliance & audit](#15-compliance--audit)
16. [Build sequence](#16-build-sequence)
17. [Open questions](#17-open-questions)
18. [Cross-references](#18-cross-references)

## Dependencies

Reads from foundations:
- **§3.2 `ActionResult<T>`** — all server actions return `ActionResult<T>`; never throw to clients.
- **§3.4 `can()`/`requireCan()`** — `'subscription.cancel'`, `'subscription.upgrade'`, `'billing.read'` permissions live in the §01 matrix.
- **§4.7 foundation tables** — `rate_limits`, `idempotency_keys` consumed for action protection.
- **§6.6 `webhook_events` + `ingestWebhook` skeleton** — Stripe webhook handler reuses this; §12 does NOT redefine the table.
- **§7.1 SMS wrapper** — billing-failure SMS escalation (Pro only).
- **§15a.1 GDPR erasure pattern** — `redacted_at` marker + `erasure_log` for PII in `billing_audit_log`.
- **§15a.2 PSD2 / SCA** — day-91 MIT charges require documented consent trail.
- **§15a.6 ANPC + EU VAT (B2B reverse-charge, VIES, e-Factura)** — drives `customer_type` capture + Stripe Tax config.
- **§16.1 `ERROR_CODES`** — billing errors live in TV1000–TV1099.
- **§16.2 `AUDIT`** — all billing audit actions registered under `AUDIT.billing.*`.
- **§16.3 `JOBS`** — pg-boss job keys live under `JOBS.billing.*`.

Writes back to foundations:
- **§16.1 ERROR_CODES**: TV1001 = `trial_already_used`, TV1002 = `tax_id_already_claimed`, TV1003 = `card_declined`, TV1004 = `vies_validation_failed`, TV1005 = `downgrade_blocked_venue_count`, TV1006 = `subscription_authentication_required`.
- **§16.2 AUDIT.billing**: extended beyond the initial 5 actions to cover the full §12 vocabulary (see §6.3.2).
- **§16.3 JOBS.billing**: extended to cover the operational jobs declared in §13.

## 1. Scope

This domain owns: the subscription state machine, the Stripe Customer + Subscription objects, the trial-to-active transition, billing math (base tier × frequency + per-location quantity + overage), card-on-file collection and management, invoices + receipts surfaced to operators, refund mechanics for annual prepays, dunning when payment fails, and cancellation flows.

It does **not** own: Stripe Connect for restaurant deposit accounts (→ §10 — that's separate from platform-subscription Stripe Customer; Tavli's platform is a Stripe Customer of `tavli.ro`, the restaurant is its own Stripe Connect account for deposits), the marketing-suite overage *computation* (→ §11 — feeds the overage line item to §12).

### Checkboxes covered

From §4 Contractual promises:
- [ ] "No per-cover fees, ever" _(Architectural property, no code: the data model has no `per_cover_amount_cents` column on `subscription_items`; reservations never gate on billing math; introducing a per-cover bill would require a schema migration that this doc forbids.)_
- [ ] Full CSV export on cancellation *(triggers §07's export at cancel; §13 orchestrates)*
- [ ] Pro-rata refund on annual prepay cancellation
- [ ] Monthly billing default; annual prepay = explicit opt-in _(Architectural property, no code: `subscriptions.frequency default 'monthly'`; the signup form's annual radio is opt-in only.)_
- [ ] One-click cancellation in product (no support ticket required)
- [ ] One free trial per legal entity (CUI / VAT enforcement) *(designed in §01; enforced here at subscription creation)*
- [ ] Card-on-file at signup, auto-charge day 91
- [ ] Reminder emails at day 60, 75, 85 before billing starts

From §1 / §2 tier features:
- [ ] €30/mo Tavli (Base) _(Architectural property, no code: price set in Stripe seed script §16 step 3; `tax_behavior: 'exclusive'` asserted at deploy time.)_
- [ ] €60/mo Tavli Pro _(Architectural property, no code: same seed-script source.)_
- [ ] Annual prepay = 2 months free (effective €25/€50 / mo) _(Architectural property, no code: annual prices are 10× monthly, hard-coded in the seed script.)_
- [ ] Pro covers 3 locations included; €15/mo for each additional

From §11 marketing suite:
- [ ] Monthly overage invoice line (€0.06/SMS, €0.03/WhatsApp; email free)

## 2. Current state

There is no billing infrastructure in the schema today. No Stripe SDK in `package.json`. No subscription state. The corporate-events foundation (§10) has the data model for *event-side* deposits but no platform subscription.

**What's planned in `00-foundations.md` §17.8:** install Stripe SDK + Connect onboarding flow stub. That stub lands; this doc builds the actual subscription product on top.

## 3. Architectural pillars

### 3.1 One subscription per organisation

Pricing is `org`-level, not `restaurant`-level. The org has a single Stripe Subscription. Multi-venue Pro orgs use Stripe's quantity-based subscription item for "extra locations." When a 4th venue is added, the quantity increments and Stripe handles proration.

### 3.2 Stripe is the source of truth for billing state; Tavli mirrors

The Stripe Subscription's `status` is canonical. Tavli's `subscriptions.status` column is a mirror, updated via webhooks. The UI reads the mirror; jobs that need certainty re-query Stripe.

### 3.3 Trial state lives in Tavli, not Stripe

The 3-month free trial is enforced by Tavli's own state machine (not Stripe's `trial_end` mechanism), for two reasons:
- Stripe's trial doesn't natively support "card-on-file mandatory but bill starts day 91 even if they never confirm." Stripe trials are softer.
- The "one free trial per legal entity" enforcement is Tavli-specific data (CUI lookup); Stripe knows nothing about CUIs.

Implementation: at signup, create the Stripe Subscription immediately with `trial_end = unix_time(signup + 90 days)` AND with `payment_behavior: 'default_incomplete'` so a card is captured but not charged. At day 91, Stripe's normal billing cycle takes over.

`subscriptions.trial_started_at` + `trial_ends_at` are the single source of truth on Tavli's side (no duplicate columns on `organizations`). One-trial-per-tax-id enforcement is a JOIN against this table per §01 §8. Stripe holds its own copy of `trial_end`; the §12 webhook handler keeps them aligned.

### 3.4 Monthly is the default; annual is explicit opt-in

Spec: "monthly billing default; annual prepay is for the 2-months-free discount, not for keeping you stuck." Annual is a different Price object in Stripe. Switching modes is allowed but only at renewal (no mid-month flips — keeps the math sane).

### 3.5 Canonical tier-read helper

All other domains read tier + status through one helper, not via direct columns on `organizations`:

```ts
// src/lib/billing/load-subscription.ts

export interface ActiveSubscriptionState {
  subscriptionId: string                 // local subscriptions.id
  stripeSubscriptionId: string
  tier: 'base' | 'pro'
  status: subscription_status
  frequency: billing_frequency
  trial_ends_at: Date | null
  current_period_end: Date | null
  pending_frequency_change: billing_frequency | null
  items: Array<{
    id: string                            // local subscription_items.id
    stripeSubscriptionItemId: string
    kind: subscription_item_kind
    quantity: number
  }>
}

export async function loadActiveSubscription(organizationId: string): Promise<ActiveSubscriptionState | null>
```

Other domains call this to gate tier-only features. Never read `organizations.subscription_tier` (no such column exists) or query `subscriptions` directly from outside §12. The `items` array is included so callers like §8.1's `syncExtraLocationQuantity` can find specific subscription items without a second query.

**Contract specification (locked):**

The helper returns `null` in any of these cases:
1. The org has no row in `subscriptions` (e.g., it's a free-tier org or its subscription was hard-deleted post-retention).
2. The org's `subscriptions` row exists but `organizations.stripe_customer_id IS NULL` (orphan row from a botched signup; should not happen but the helper is defensive).
3. The Postgres read fails (transient connection error). The error is logged to Sentry with `level: 'warning'` and **not thrown** — billing reads should never block a read path. The helper returns `null` and callers fall through to their fallback.

The helper reads the local `subscriptions` mirror only — it does **NOT** call the Stripe API. Stripe is the source of truth (§3.2) but reads from this helper return the mirror's last-known state. Jobs that require live Stripe certainty (e.g., the nightly reconciliation job in §13) call Stripe directly and bypass this helper.

Callers MUST treat `null` as "no active paid subscription" and provide one of:
- A free-tier fallback (e.g., the marketing suite simply doesn't show campaign features).
- A trial-expired banner (when paired with a `trial_ends_at < now()` check).
- A read-only mode (when paired with the `status = 'unpaid'` indicator).

Callers MUST NOT throw on `null` or treat it as an error — the helper's null return is part of the happy path.

**Per-request memoization (locked):** the helper is wrapped in React's `cache()` (same pattern as §01 `can()`). Within a single request, repeated calls with the same `organizationId` hit Postgres at most once. Failures are NOT retried within the same request — the cached `null` persists for the request lifetime to avoid retry storms. There is exactly one memoization mechanism; do not introduce a second `Map`-based cache.

### 3.6 Tax via Stripe Tax (for now)

Per the spec: "All prices + TVA stated once, prominently." Stripe Tax computes TVA on RO invoices automatically given the customer's tax_id and address. We pass `automatic_tax: { enabled: true }` on the subscription. For non-RO orgs, Stripe Tax handles the right rate per country.

#### 3.6.1 B2B vs B2C disclosure rules (locked)

Per foundations §15a.6 (ANPC) + EU VAT directive, the price displayed and invoiced depends on the customer's tax status. The rules:

- **B2B within RO** (valid RO VAT-ID, business customer): reverse-charged TVA. Invoice shows price ex-VAT with the note "TVA invers (taxare inversă, art. 331 CF)". The customer accounts for VAT on their own RO VAT return.
- **B2C within RO** (personal customer): VAT-inclusive display per ANPC consumer-protection rules. Headline price on the pricing page is the gross amount the customer pays; invoice itemises the 19% VAT separately for transparency.
- **B2B within EU outside RO** (valid VAT-ID via VIES): reverse-charged TVA. Same display + invoice rule as RO B2B.
- **B2C within EU outside RO**: charged at the customer's country's VAT rate (e.g., 19% DE, 20% AT, 22% IT). Stripe Tax handles the per-country rate; invoice itemises.
- **B2B / B2C outside EU**: no VAT.

#### 3.6.2 Signup customer-type capture (required)

The §01 signup form **requires** a customer-type radio before plan selection:
- **Business** — captures legal name + VAT-ID (CUI for RO). The VAT-ID is validated against VIES at signup (per foundations §15a.6) before the subscription is created. Invalid VAT-IDs block signup; the form displays "Couldn't verify this VAT-ID — please double-check, or contact us if it's correct and we'll review."
- **Personal** — captures full name only; no VAT-ID field shown.

The choice is stored on `organizations.customer_type` (new enum: `'business' | 'personal'`) and passed to Stripe as the customer's `tax_id_data` (B2B) or omitted (B2C). Changing customer type post-signup requires Tavli admin action (it changes the invoicing model retroactively for the org's open invoices and is rare enough to not warrant a self-service path).

#### 3.6.3 `tax_behavior` enforcement

Stripe Tax is configured at the price level with `tax_behavior: 'exclusive'` (TVA computed on top of the price). The seed script (§16 step 3) verifies this at deploy time — see §16 step 3a below. CI fails if any Tavli Stripe price has `tax_behavior != 'exclusive'`.

#### 3.6.4 Stripe Tax registration operational doc

Tavli registers as a Stripe-remitting seller in RO; Stripe files + remits VAT via VIES reporting on our behalf. The operational playbook (registration paperwork, Stripe Tax dashboard configuration, monthly reconciliation against ANAF returns) lives at `docs/operations/stripe-tax-setup.md`. Decision checkpoint at **€50k MRR**: evaluate whether self-remitting saves enough on Stripe Tax's fixed monthly cost to justify the in-house accounting overhead.

Caveat: Stripe Tax registration in RO is required for Stripe to remit on our behalf. If we self-remit (more likely at low volume), Stripe Tax computes the rate; we file. Either way, the math comes from Stripe.

## 4. Data model

### 4.1 New enums

```sql
create type subscription_tier as enum ('base', 'pro');
create type billing_frequency as enum ('monthly', 'annual');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'unpaid', 'incomplete');
create type subscription_item_kind as enum ('base_tier', 'extra_location', 'sms_overage', 'whatsapp_overage');
create type org_customer_type as enum ('business', 'personal');           -- §3.6.2: drives B2B vs B2C VAT behaviour
```

### 4.1a `organizations` columns added by this domain

```sql
-- Owned by §01; this domain adds the billing-relevant columns via migration.
alter table organizations
  add column stripe_customer_id varchar(80) unique,                       -- set when Stripe Customer is created (§7.1 step 3)
  add column customer_type org_customer_type,                             -- §3.6.2: nullable until completed-signup; required for active subscription
  add column re_trial_granted boolean not null default false;             -- §17 OQ3: Tavli-admin grant of a second free trial in good-faith cases
```

The §01 signup form enforces `customer_type IS NOT NULL` before `startSubscription` runs. The check constraint `chk_active_org_has_customer_type` (added as a deferrable constraint) asserts no `subscriptions` row in `('trialing','active','past_due','unpaid')` exists for an org with `customer_type IS NULL`.

### 4.2 New table: `subscriptions`

One row per organisation. Mirrors Stripe Subscription.

```sql
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  stripe_subscription_id varchar(80) not null unique,
  stripe_customer_id varchar(80) not null,                     -- denormalised from organizations.stripe_customer_id

  tier subscription_tier not null,
  frequency billing_frequency not null default 'monthly',

  status subscription_status not null,
  status_synced_at timestamptz not null default now(),

  -- Trial
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,                          -- start + 90 days
  trial_conversion_blocked_at timestamptz,                     -- if billing failed at day 91

  -- Current period
  current_period_start timestamptz,
  current_period_end timestamptz,

  -- Cancellation
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,                                    -- when the cancellation became effective
  cancellation_reason text,
  cancellation_requested_by_user_id uuid references auth.users(id) on delete set null,

  -- Payment-method binding (mirrors Stripe Subscription's default_payment_method)
  default_payment_method_stripe_id varchar(80),                -- set by the setup_intent.succeeded handler (§7.2)

  -- PSD2 explicit-consent email (§7.3 step 2; required for the recital-15 audit trail)
  consent_email_sent_at timestamptz,                           -- set exactly once per subscription; idempotency token for the SetupIntent webhook

  -- Annual prepay specifics
  annual_paid_through timestamptz,                             -- when the annual prepayment covers them until

  -- Pending frequency change (monthly ↔ annual takes effect at next period end)
  pending_frequency_change billing_frequency,
  pending_frequency_effective_at timestamptz,                  -- typically equals current_period_end
  pending_frequency_requested_at timestamptz,
  pending_frequency_requested_by_user_id uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index subscriptions_org_active on subscriptions (organization_id)
  where status in ('trialing', 'active', 'past_due', 'unpaid');

create index subscriptions_trial_ends on subscriptions (trial_ends_at) where status = 'trialing';
create index subscriptions_current_period_end on subscriptions (current_period_end) where status in ('active', 'past_due');
create index subscriptions_stripe_id on subscriptions (stripe_subscription_id);

-- RLS: org owners + admins see their org's subscription; service-role only for mutations (Stripe webhooks).
alter table subscriptions enable row level security;

create policy "subscriptions_admin_select" on subscriptions
  for select using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and is_active = true and role in ('owner', 'admin')
    )
  );

-- subscription_items, invoices, payment_methods, billing_audit_log, webhook_events all follow the same
-- RLS pattern: org-admin SELECT scoped via organization_id; mutations service-role-only.
-- (RLS bodies elided for brevity; same template as above with the appropriate FK relationship.)
```

The partial unique index on `(organization_id)` where status is active-ish prevents two concurrent subscriptions; cancelled/incomplete rows can coexist (historical).

### 4.3 New table: `subscription_items`

Quantity-based line items within a subscription.

```sql
create table subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  stripe_subscription_item_id varchar(80) not null unique,

  kind subscription_item_kind not null,
  stripe_price_id varchar(80) not null,
  quantity integer not null default 1,
  unit_amount_cents integer not null,                          -- snapshot for display
  currency char(3) not null default 'EUR',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index subscription_items_kind_unique on subscription_items (subscription_id, kind)
  where kind in ('base_tier', 'extra_location');

create index subscription_items_subscription on subscription_items (subscription_id);
```

`base_tier` and `extra_location` are unique per subscription (one row each, quantity tracks count). Overage items (`sms_overage`, `whatsapp_overage`) can have multiple historical rows representing past months' overages (but only one active item per billing period).

### 4.4 New table: `invoices`

Mirrors Stripe Invoices.

```sql
create table invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  stripe_invoice_id varchar(80) not null unique,

  status varchar(20) not null,                                  -- 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
  amount_due_cents integer not null,
  amount_paid_cents integer not null default 0,
  tax_amount_cents integer not null default 0,                  -- TVA via Stripe Tax
  currency char(3) not null,
  hosted_invoice_url text,                                       -- Stripe-hosted; for "view invoice" link
  invoice_pdf_url text,                                          -- Stripe-hosted PDF

  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,

  created_at timestamptz not null default now()
);

create index invoices_org on invoices (organization_id, created_at desc);
create index invoices_subscription on invoices (subscription_id, created_at desc);
create index invoices_status on invoices (status);
```

We don't generate our own subscription invoice PDFs — Stripe's are legally compliant + look professional. For RO ANPC compliance we'd need invoice numbering sequences (per §10 §7.3); Stripe's invoice numbers satisfy this requirement when properly configured.

### 4.5 New table: `payment_methods`

```sql
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  stripe_payment_method_id varchar(80) not null unique,

  type varchar(20) not null,                                     -- 'card' | 'sepa_debit' | ...
  card_brand varchar(20),                                         -- 'visa' | 'mastercard' | ...
  card_last4 varchar(4),
  card_exp_month smallint,
  card_exp_year smallint,
  is_default boolean not null default false,

  created_at timestamptz not null default now(),
  detached_at timestamptz
);

create index payment_methods_org on payment_methods (organization_id) where detached_at is null;
```

### 4.6 New table: `billing_audit_log`

Append-only billing-event trail for ANPC + financial-dispute defensibility.

```sql
create table billing_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,    -- nullable + set null: billing audit survives org deletion (7-year RO Codul Fiscal retention)
  organization_id_at_event uuid not null,                                    -- stable copy of org_id, never null, never updated
  event_type varchar(60) not null,                              -- canonical AUDIT.billing.* keys (§6.3.2): 'billing.subscription_created', 'billing.subscription_upgraded', 'billing.subscription_cancelled', 'billing.payment_succeeded', 'billing.payment_failed', 'billing.refund_issued', etc.
  actor_user_id uuid references auth.users(id) on delete set null,
  context jsonb not null,                                        -- stripe ids, amounts, before/after states
  occurred_at timestamptz not null default now()
);

create index billing_audit_log_org on billing_audit_log (organization_id, occurred_at desc);
create index billing_audit_log_type on billing_audit_log (event_type, occurred_at desc);
```

**Two-column rationale (locked):** the table has both `organization_id` and `organization_id_at_event` columns for a deliberate reason.

- `organization_id` is a foreign key with `ON DELETE SET NULL`. If the org is eventually hard-deleted (post-7-year retention), this column nulls out — the audit row survives but loses its live FK relationship. Set at insert; only mutated by the FK's `SET NULL` cascade behavior.
- `organization_id_at_event` is the **denormalised, immutable snapshot** of the org id at the moment the audit row was written. It is `NOT NULL` and never updated post-insert. This is the column ANPC + forensic queries use to ask "which audit rows belonged to this org at the time the event happened" — even if the org has since been hard-deleted, this column still tells the story.

Both columns are set at insert (same value). Subsequent reads filter on `organization_id_at_event` for historical queries (survives org deletion) and on `organization_id` for live-org queries (filtered by RLS for active org members).

### 4.7 `webhook_events` — see foundations §6.6

§12 does **not** declare its own webhook table. The Stripe webhook handler at `src/app/api/webhooks/stripe/route.ts` uses the foundations `ingestWebhook` skeleton (§6.6) with `provider = 'stripe'`. Idempotency is enforced by the foundation's `unique(provider, provider_event_id)` constraint; the handler is replay-safe.

Per-event `context` denormalisation: when the Stripe handler decodes the payload, it persists the resolved `organization_id` + `subscription_id` + (where relevant) `invoice_id` into `webhook_events.context` so support staff can join on `webhook_events.context->>'organization_id'` without re-parsing the raw payload.

## 5. Stripe products + prices

Defined once in Stripe Dashboard (or via Stripe API in a one-time setup script). Cached in seed data for engineer reference.

| Product | Description |
|---|---|
| `prod_tavli_base` | Tavli (Base) — single-venue reservation platform |
| `prod_tavli_pro` | Tavli Pro — multi-venue + marketing suite |
| `prod_tavli_extra_location` | Per-additional-location add-on (Pro only, beyond 3 included) |
| `prod_sms_overage` | SMS overage metering |
| `prod_whatsapp_overage` | WhatsApp overage metering |

Prices (Stripe Price objects):
- `price_base_monthly` — €30.00 / mo, EUR, recurring monthly
- `price_base_annual` — €300.00 / yr (10 months × €30, 2 months free), EUR, recurring annually
- `price_pro_monthly` — €60.00 / mo
- `price_pro_annual` — €600.00 / yr (10 × €60)
- `price_extra_location_monthly` — €15.00 / mo / location
- `price_extra_location_annual` — €150.00 / yr / location (10 × €15)
- `price_sms_overage` — €0.06 / SMS, billed via metered usage
- `price_whatsapp_overage` — €0.03 / WhatsApp, billed via metered usage

All prices include `tax_behavior: 'exclusive'` (TVA added on top per spec).

## 6. Subscription state machine

### 6.1 States

- `incomplete` — Stripe Subscription created but no payment method attached. Cleanup target after 24h.
- `trialing` — within the 90-day free trial. Card on file.
- `active` — billing normally.
- `past_due` — most recent invoice failed. Dunning in progress.
- `unpaid` — multiple invoice failures; dunning exhausted. Subscription stopped collecting.
- `cancelled` — subscription ended. Org loses access to paid features at period end (if `cancel_at_period_end = true`) or immediately (if cancelled mid-period via admin tool).

### 6.2 Transitions

```
incomplete   → trialing       (card attached within 24h)
incomplete   → cancelled       (no card within 24h)
trialing     → active          (trial_ends_at reached, first invoice paid)
trialing     → past_due        (trial_ends_at reached, first invoice failed, non-SCA reason)
trialing     → incomplete      (trial_ends_at reached, first invoice requires fresh SCA — §7.3 step 3)
active       → past_due        (subsequent invoice failed)
active       → incomplete      (subsequent invoice requires fresh SCA — issuer step-up after a regulatory storm)
incomplete   → active          (3DS challenge completed via hosted invoice URL, invoice.pay() succeeded)
past_due     → active          (invoice retry succeeded)
past_due     → unpaid          (dunning exhausted)
unpaid       → active          (manual recovery via "fix payment method")
active       → cancelled       (org admin cancels)
trialing     → cancelled       (org admin cancels during trial — no charge ever)
past_due     → cancelled       (org admin cancels while past_due)
unpaid       → cancelled       (org admin cancels while unpaid)
```

`incomplete` and `past_due` are distinct states with distinct dunning paths:
- `past_due` = the charge failed for a non-authentication reason (insufficient funds, expired card, fraud block). Stripe smart retries handle re-attempts; dunning email arrives immediately.
- `incomplete` = the charge needs fresh on-session SCA (the issuer rejected the off-session mandate). Smart retries will fail again until SCA completes; we route the operator to the Stripe-hosted invoice URL for the 3DS challenge.

### 6.3 Stripe events that drive transitions

| Stripe event | Tavli response |
|---|---|
| `customer.subscription.created` | **UPSERT** `subscriptions` row on `stripe_subscription_id`. The §7.1 `startSubscription` action also inserts a `subscriptions` row server-side at signup; the webhook arrives second and must not crash on the existing row. Idempotent on conflict. |
| `customer.subscription.updated` | Mirror status, items, period dates. Two-layer idempotency per §6.3.1. |
| `customer.subscription.deleted` | Status → `cancelled`, set `cancelled_at`. |
| `customer.subscription.trial_will_end` | Send "trial ends in 3 days" email if not already sent. |
| `invoice.created` | Insert `invoices` row, status='draft'. |
| `invoice.finalized` | Update status='open', `amount_due`. |
| `invoice.paid` | Status='paid', `paid_at`. Insert audit log. |
| `invoice.payment_failed` | Status stays 'open'. Trigger dunning email. Update subscription to past_due. |
| `invoice.voided` | Status='void'. |
| `payment_method.attached` | Insert `payment_methods` row. |
| `payment_method.detached` | Set `detached_at`. |
| `charge.dispute.created` | Audit log + Sentry alert + notify Tavli admin. |
| `charge.refunded` | Audit log + reflect refund in `invoices.amount_paid_cents`. |

#### 6.3.1 Two-layer idempotency on status transitions

Cross-reference foundations §6.6 (`webhook_events` table). Subscription mirror updates check the audit log: before applying `customer.subscription.updated`, query for a prior `AUDIT.billing.subscription_updated` audit entry (in `billing_audit_log`) with the same Stripe event ID in its `context`. If present, skip (already applied). Idempotency lives at two layers:

1. **`webhook_events`** (provider+id dedup at the HTTP boundary, per foundations §6.6) — prevents the same Stripe delivery from being processed twice when Stripe retries on a transient 5xx.
2. **`billing_audit_log`** (state-transition dedup at the domain layer) — prevents the same status transition from being applied twice even if a `webhook_events` row was somehow inserted but a subsequent crash left the mirror un-updated and we replayed it.

Every webhook handler that mutates `subscriptions.status` or `invoices.status` writes a `billing_audit_log` row keyed on the Stripe event ID; the next run of the same event short-circuits on the audit-log lookup.

### 6.3.2 Audit-log action mapping (canonical)

All §12 audit writes use the `AUDIT.billing.*` registry in foundations §16.2. Direct mapping from §12 mutation → registry key:

| §12 mutation | Foundations AUDIT key | Notable `context` fields |
|---|---|---|
| `startSubscription` succeeds | `AUDIT.billing.subscription_created` | `tier`, `frequency`, `stripe_subscription_id`, `stripe_customer_id` |
| `customer.subscription.updated` mirror | `AUDIT.billing.subscription_updated` | `stripe_event_id`, `before_status`, `after_status` |
| Tier swap Base ↔ Pro (§8.2) | `AUDIT.billing.subscription_upgraded` | `from_tier`, `to_tier`, `proration_amount_cents` |
| `requestFrequencyChange` (§8.3) | `AUDIT.billing.frequency_change_requested` | `from_frequency`, `to_frequency`, `effective_at` |
| Cron applies pending frequency change | `AUDIT.billing.frequency_changed` | `from_frequency`, `to_frequency` |
| `cancelSubscription` (§10.1) | `AUDIT.billing.subscription_cancelled` | `reason`, `feedback`, `cancel_at_period_end`, `pro_rata_refund_cents` |
| Annual prepay refund issued (§10.2) | `AUDIT.billing.refund_issued` | `stripe_refund_id`, `amount_cents`, `unused_fraction` |
| `invoice.paid` webhook | `AUDIT.billing.payment_succeeded` | `stripe_invoice_id`, `amount_paid_cents` |
| `invoice.payment_failed` webhook | `AUDIT.billing.payment_failed` | `stripe_invoice_id`, `failure_reason` |
| `setup_intent.succeeded` webhook (§7.2) | `AUDIT.billing.setup_intent_succeeded` | `stripe_setup_intent_id`, `stripe_payment_method_id` |
| PSD2 consent email sent (§7.3 step 2) | `AUDIT.billing.psd2_consent_captured` | `stripe_setup_intent_id`, `email_message_id`, `email_sent_at`, `mandate_id` |
| `charge.dispute.created` webhook | `AUDIT.billing.dispute_opened` | `stripe_dispute_id`, `amount_cents`, `reason` |
| GDPR Art-17 redaction of audit row (§15.3.1) | `AUDIT.compliance.erasure_executed` | `table_name: 'billing_audit_log'`, `row_id`, `fields_erased` |

Anything not in this table requires a new foundations §16.2 registry entry before the audit write — never invent a free-string action key.

## 7. Signup + trial start

### 7.1 The `signupPartner` server action (§01 §5.2 owns the orchestration)

Step 9 of that action calls into this domain:

```ts
// src/lib/billing/start-subscription.ts

async function startSubscription({
  organizationId,
  tier,                          // 'base' | 'pro'
  frequency,                      // 'monthly' | 'annual'
}): Promise<{ stripeCheckoutUrl: string }>
```

Logic:
1. Verify no existing active subscription for this org. Fail with `TV1001` if `subscriptions.trial_started_at IS NOT NULL` for this org (and `re_trial_granted = false`).
2. Verify `organizations.tax_id` uniqueness (§01 §8 enforcement). Fail with `TV1002` if collision.
3. **Verify** `organizations.customer_type IS NOT NULL` — the §01 signup form is required to capture this before invoking us (§3.6.2). If `customer_type = 'business'`, the VAT-ID must already be VIES-validated by §01; this action does not re-validate but trusts the §01 invariant. If `customer_type IS NULL`, return `'invalid_input'` (this is an internal-bug guardrail; §01 should never call us without it).
4. Create Stripe Customer (or reuse if `organizations.stripe_customer_id` set). Pass `tax_id_data: [{ type: 'eu_vat' | 'ro_vat', value: organizations.tax_id }]` only when `customer_type = 'business'`; omit for `'personal'`. The Stripe Customer's `metadata` includes `organization_id` + `customer_type`.
5. Create Stripe Subscription:
   ```ts
   stripe.subscriptions.create({
     customer: stripeCustomerId,
     items: [
       { price: priceIdForTierFrequency(tier, frequency) },
       ...(tier === 'pro' ? [{ price: priceIdForExtraLocation(frequency), quantity: 0 }] : []),
     ],
     trial_end: unixTimestamp(now + 90 days),
     trial_settings: { end_behavior: { missing_payment_method: 'pause' } },
     payment_behavior: 'default_incomplete',
     payment_settings: { save_default_payment_method: 'on_subscription' },
     automatic_tax: { enabled: true },
     metadata: { organization_id: organizationId, tier, frequency },
   })
   ```
6. Insert `subscriptions` + `subscription_items` rows.
7. Create a Stripe Checkout Session in `mode: 'setup'` to collect card-on-file:
   ```ts
   stripe.checkout.sessions.create({
     mode: 'setup',
     customer: stripeCustomerId,
     setup_intent_data: { metadata: { subscription_id: stripeSubscriptionId, organization_id: organizationId } },
     success_url: `${SITE_URL}/partner/onboarding?card=success`,
     cancel_url: `${SITE_URL}/partner/onboarding?card=cancel`,
   })
   ```
8. Enqueue `JOBS.billing.*` pg-boss jobs:
   - `JOBS.billing.sendReminderDay60` at trial_started_at + 60 days.
   - `JOBS.billing.sendReminderDay75` at trial_started_at + 75 days.
   - `JOBS.billing.sendReminderDay85` at trial_started_at + 85 days.
   - (No explicit day-91 job — Stripe's billing cycle handles the conversion.)
9. Audit log: `AUDIT.billing.subscription_created` (per §6.3.2).
10. Return the Checkout URL to the §01 action; that action redirects the user.

### 7.2 Card-on-file collection at signup

Stripe Checkout (mode: 'setup') gives a fully-hosted, PCI-compliant card-entry page. Operator enters card; on success, the SetupIntent attaches the payment method to the customer.

**The `setup_intent.succeeded` webhook handler (locked contract):**

The Stripe SetupIntent created at signup includes `metadata.subscription_id` + `metadata.organization_id` (set at Checkout session creation in §7.1 step 7). The handler:

1. **Validates** the SetupIntent has `metadata.subscription_id` set; rejects (and Sentry-alerts) if missing — that indicates a Checkout misconfiguration.
2. **Maps SetupIntent → subscription** via the metadata. If the subscription row is not found (race with subscription creation), the handler defers via `webhook_events` retry (returns 500; foundations §6.6 retry handles it).
3. **Attaches the payment method to BOTH Stripe and our mirror.** Fetches the attached `payment_method` from the SetupIntent, then:
   - Calls `stripe.subscriptions.update(stripeSubId, { default_payment_method })` so the next invoice charges the right card.
   - Updates `subscriptions.default_payment_method_stripe_id` on the mirror.
   Both updates are idempotent on equal-value (no-op when unchanged). If a newer payment method arrives (rare; user re-ran Checkout), the newer one wins and the old one is detached via `stripe.paymentMethods.detach`.
4. **Replays the explicit-consent email** (per §7.3 step 2) if `consent_email_sent_at IS NULL` on the subscription row. Sets `consent_email_sent_at = now()` on send. This ensures the PSD2 recital-15 audit evidence is captured exactly once per subscription, even across webhook retries.
5. **Writes `billing_audit_log`** with `event_type = AUDIT.billing.setup_intent_succeeded` and `context = { setup_intent_id, payment_method_id, subscription_id, organization_id }`.

The subscription is now ready to bill at trial-end.

### 7.3 Day-91 auto-conversion (PSD2 / SCA compliant)

Per foundations §15a.2, EU recurring-payment auth requires explicit upfront SCA + a documented merchant-initiated-transaction (MIT) consent trail. The conversion flow:

1. **SetupIntent at signup with 3DS challenge.** Stripe Checkout in `mode='setup'` handles the 3DS step inline; the issuer's bank presents the confirmation flow to the operator. The SetupIntent succeeds only after SCA completes; failure blocks signup at the card-capture step (subscription stays `incomplete`).

2. **Explicit recurring-charge confirmation email** sent post-Checkout — subject line **"Card on file at Tavli — recurring charge confirmation"** (templated in §04 as `RecurringChargeConsentEmail`). This is the PSD2 recital-15 audit evidence ("explicit consent for the merchant-initiated transaction"). The email is sent within 60 seconds of `setup_intent.succeeded` and its provider message id is captured in `billing_audit_log`.

3. **First charge on day 91 is a merchant-initiated transaction (MIT).** Stripe invoices the subscription at `trial_end`; the charge uses `off_session: true` with the SetupIntent's saved mandate. On `authentication_required` (rare; happens during regulatory storms or if the issuer demands step-up SCA), Stripe returns `requires_action` → subscription enters `incomplete` (**not** `past_due`). Dunning emails link directly to the Stripe-hosted invoice URL (`invoices.hosted_invoice_url`, mirrored from `invoice.hosted_invoice_url`), which presents the 3DS challenge inline. Successful 3DS completion triggers the `invoice.payment_succeeded` webhook; the handler transitions the subscription back to `active`. No bespoke 3DS-challenge subdomain is built — Stripe's hosted page already does this correctly and is PCI-out-of-scope for us.

4. **Audit-log evidence.** A `billing_audit_log` row with `event_type = AUDIT.billing.psd2_consent_captured` is written immediately after the confirmation email send, with `context = { stripe_setup_intent_id, email_message_id, email_sent_at, mandate_id }`. This row is retained for the full 7-year fiscal window — it is the legal evidence the issuer may demand if the customer disputes the first MIT charge.

### 7.4 Trial conversion failure

If day-91 charge fails for reasons other than `authentication_required`:
1. Subscription enters `past_due`.
2. `billing.send-payment-failed` email sent.
3. Dunning schedule: retry at day 92, 94, 97, 101 (Stripe's smart retries default; configurable in Stripe Dashboard).
4. If all retries fail: subscription → `unpaid`. Org loses access to paid features (read-only). Banner across partner portal: "Update payment method to restore access."
5. The org can recover at any time: enter a new card (triggers a fresh SetupIntent → 3DS) → backend triggers `invoice.pay()` → if succeeds, resubscription completes.

If the failure was specifically `authentication_required` (per §7.3 step 3), the subscription routes to the `incomplete` flow above — distinct from `past_due` — because the issuer has refused the off-session mandate and a fresh on-session SCA is required.

## 8. Per-additional-location billing

### 8.1 Quantity update on venue add

§09 §5.1's `addVenueToOrg` action fires a hook into this domain after the venue is created. Hook:

```ts
async function syncExtraLocationQuantity(organizationId: string) {
  const subscription = await loadActiveSubscription(organizationId)
  if (!subscription) return                              // org has no active subscription; nothing to sync
  if (subscription.tier !== 'pro') return                // Base can only have 1 venue anyway

  // Count live (non-archived) venues for this org.
  const venueCount = await db.select({ c: count() }).from(restaurants)
    .where(and(
      eq(restaurants.organizationId, organizationId),
      isNull(restaurants.archivedAt)                     // §09 convention: archived_at is null = live
    ))

  const extraCount = Math.max(0, venueCount[0].c - 3)    // 3 included with Pro

  const extraItem = subscription.items.find(i => i.kind === 'extra_location')
  if (!extraItem) {
    if (extraCount === 0) return                         // no extras + no item: nothing to do
    const stripeItem = await stripe.subscriptionItems.create({
      subscription: subscription.stripeSubscriptionId,
      price: priceIdForExtraLocation(subscription.frequency),
      quantity: extraCount,
      proration_behavior: 'create_prorations',
    })
    await insertSubscriptionItem({ ...stripeItem, kind: 'extra_location' })
  } else if (extraItem.quantity !== extraCount) {
    await stripe.subscriptionItems.update(extraItem.stripeSubscriptionItemId, {
      quantity: extraCount,
      proration_behavior: 'create_prorations',
    })
    await updateSubscriptionItemQuantity(extraItem.id, extraCount)
  }
}
```

Price-ID resolvers (`priceIdForTierFrequency`, `priceIdForExtraLocation`) live in `src/lib/billing/price-ids.ts` and read from a hard-coded map keyed by `(tier, frequency)` that is seeded at `process.env.STRIPE_PRICE_*` envs. The seed script (§16 step 3) asserts that the env values exist as live Stripe prices.

Stripe handles proration automatically — a venue added mid-month is billed for the remaining days; a venue removed mid-month is prorated as a credit.

### 8.2 Tier upgrade Base → Pro

Org admin clicks "Upgrade to Pro" in `/partner/org/[orgId]/billing`:

1. Server action `upgradeSubscriptionTier(orgId, 'pro')`.
2. Loads current subscription.
3. Updates the Stripe subscription's `base_tier` item to the Pro price:
   ```ts
   stripe.subscriptions.update(stripeSubId, {
     items: [{
       id: baseTierItemStripeId,
       price: priceIdForTier('pro', currentFrequency),
     }],
     proration_behavior: 'create_prorations',
   })
   ```
4. If venue count > 3, add the `extra_location` item via §8.1.
5. Update `subscriptions.tier = 'pro'`.
6. Audit log.

Downgrade Pro → Base: reverse, but blocks if `venue_count > 1`. Forces explicit venue deactivation first (per §09 §12 open question 2).

### 8.3 Frequency switch (monthly ↔ annual)

Allowed at any time but only takes effect at the **next period end** (avoid mid-period accounting weirdness). Implementation:

1. Org admin chooses new frequency → server action `requestFrequencyChange(orgId, newFrequency)`.
2. Action sets `subscriptions.pending_frequency_change = newFrequency`, `pending_frequency_effective_at = current_period_end`, `pending_frequency_requested_at = now()`, captures the actor.
3. UI shows "Switch to annual takes effect on DD MMM YYYY. Cancel pending change?" until applied.
4. Cron job `billing.apply-pending-frequency-changes` (every 30 min): for every subscription where `pending_frequency_change is not null and pending_frequency_effective_at <= now() and status = 'active'`:
   - Swap the Stripe subscription items to the new frequency's price IDs (base_tier + extra_location).
   - Clear the four `pending_frequency_*` columns.
   - Update `subscriptions.frequency`.
   - Insert `billing_audit_log` entry with `event_type = AUDIT.billing.frequency_changed`.
5. The org admin can cancel a pending change before `pending_frequency_effective_at` via `cancelPendingFrequencyChange(orgId)` — clears the four columns, audit logged.

If the user requests another frequency change while one is already pending, the new request overwrites the old (audit logged as "frequency_change_replaced").

## 9. Marketing overage billing

### 9.1 Monthly overage computation

Per `11-marketing-suite.md` §14's `marketing.monthly-overage-billing` job:

1. Run on the 1st of each month at 02:00 UTC.
2. For each org with `subscriptions.tier = 'pro'`:
   - Compute `marketing_quota_usage` overages for the prior month.
   - Compute amount: `sms_overage = (sms_overage_count) × 6 cents`, `whatsapp = × 3 cents`.
3. If amount > 0: report to Stripe as a metered-usage record:
   ```ts
   stripe.subscriptionItems.createUsageRecord(smsOverageItemStripeId, {
     quantity: smsOverageCount,
     timestamp: priorMonthEndUnixSeconds,
     action: 'set',
   })
   ```
4. Stripe rolls the metered usage into the next monthly invoice automatically.

The overage subscription items (`sms_overage`, `whatsapp_overage`) are added to a Pro subscription at signup with quantity 0; usage records bump the billed quantity.

### 9.2 Email overage

Per spec: "email free." No metering needed for email overage. Resend's own pricing covers our outbound; restaurant pays €0 marginal cost.

## 10. Cancellation flow

### 10.1 One-click in product

`/partner/org/[orgId]/billing/cancel`. Single screen:
- Current plan + period end displayed.
- Reason picker (optional dropdown: too_expensive / missing_feature / business_closing / switching_provider / temporary_pause / other).
- Optional free-text feedback.
- Two CTAs: "Pause billing at period end" (recommended — keeps data accessible until period_end) and "Cancel immediately."

Server action `cancelSubscription(input)`:

1. `can(session, 'subscription.cancel', { kind: 'organization', id: orgId })`.
2. Verify subscription exists + status ∈ (active, trialing, past_due).
3. For "pause at period end": `stripe.subscriptions.update(stripeId, { cancel_at_period_end: true })`. Mirror to Tavli: `cancel_at_period_end = true`.
4. For "cancel immediately": `stripe.subscriptions.cancel(stripeId, { prorate: true })`. Mirror status to `cancelled`, set `cancelled_at`.
5. Capture reason + feedback in `billing_audit_log`.
6. Send cancellation confirmation email (template per §04: `SubscriptionCancelledEmail`).
7. Trigger §13's data-export-on-cancel flow (final CSV export with all venues, all dates, all includes).
8. Audit log: `AUDIT.billing.subscription_cancelled` (per §6.3.2).

No retention call. No 7-business-day processing. One click ends it.

### 10.2 Annual prepay pro-rata refund

When an annual subscriber cancels mid-year:
1. Compute unused fraction: `(annual_paid_through - now()) / (annual_paid_through - subscription.current_period_start)`.
2. Refund amount = `paid_amount × unused_fraction`.
3. `stripe.refunds.create({ payment_intent: ..., amount: refundCents, reason: 'requested_by_customer' })`.
4. Audit log + refund email + reflect in `invoices.amount_paid_cents`.

The spec says "no questions" — implementation enforces this: no admin approval, no "are you sure," runs immediately on cancel for annual-prepay cancellations.

### 10.3 Access after cancellation

- `cancel_at_period_end = true`: org keeps full access until `current_period_end`. Banner: "Subscription ends DD MMM YYYY."
- Cancelled immediately: org goes to read-only for 30 days (data export grace period, aligned with the §03 §8.2 / §13 GDPR reversibility window), then archived. Sign-in still works (to access exports); creating new bookings + campaigns blocked.
- After 30 days post-cancellation: subscription archived; `organizations.status = 'suspended'`. Restoration possible via Tavli admin for another 60 days (90 days total).
- After 90 days: **operational hard-delete** — set `restaurants.archived_at = now()` for all venues (§09 soft-delete convention), `organizations.status = 'archived'`, RLS blocks live access. Audit-bearing tables (`audit_logs`, `billing_audit_log`, `marketing_consent_audit`) keep their rows — their FK to `organizations` is `on delete set null`, so they survive org deletion and run their own retention timers (7 years for billing audit per RO Codul Fiscal; same for general audit).
- **True hard-delete of the `organizations` row** is deferred until the longest applicable retention timer expires. For orgs with any billing history, that's 7 years — orchestrated by §13's retention purge.

## 11. Dunning

When `invoice.payment_failed`:

1. Subscription → `past_due` (or `incomplete` if `authentication_required` — see §7.3 step 3 for the SCA branch).
2. Email org admins immediately: "Payment failed — we'll try again in 2 days." Email includes the `hosted_invoice_url` so the operator can pay manually right now if they prefer.
3. Stripe automatically retries via smart-retries (default cadence: day 1, 3, 5, 7 after failure; configurable in Stripe Dashboard).
4. After each retry failure: another email, escalating tone (day 7 includes a Pro-tier SMS via §7.1 wrapper).
5. **Tiered access restriction** (locked, per §17 OQ6 decision):
   - **Days 0–6 of `past_due`**: full access continues. Banner + emails only.
   - **Day 7**: **soft-lock of write operations** — new bookings still allowed (the operator's diners must not be harmed by their operator's billing lapse), but campaign sends pause, photo upload disabled, settings editing disabled. Banner becomes red-prominent.
   - **Day 21**: subscription → `unpaid`. **Full read-only mode** — diner bookings continue (still under contract — see *Diner protection* below), but the operator portal is read-only except for the "Update payment method" CTA.
6. **Diner protection during `unpaid`**: existing reservations remain valid + the diner-facing flow is untouched. Tavli covers the operational cost while the operator recovers; this is the contract — diner trust never depends on the operator's billing status. After 7 days in `unpaid`, the org enters the §10.3 cancellation-grace path even without an explicit cancellation event.
7. Manual recovery from `past_due` or `unpaid`: org admin enters a new card → fresh SetupIntent + 3DS → backend triggers `invoice.pay()` → if succeeds, subscription resumes (`active`) and all write paths re-open immediately.

## 12. UI surfaces

### 12.1 Billing dashboard (`/partner/org/[orgId]/billing`)

- Current plan: tier + frequency + next billing date + amount.
- Card on file: brand + last 4 + exp.
- Recent invoices: list with "Download PDF" links to Stripe-hosted PDFs.
- "Change plan" CTA (upgrade/downgrade tier or switch monthly/annual).
- "Update payment method" CTA → Stripe Billing Portal session.
- "Cancel subscription" CTA → cancellation flow.
- Usage section (Pro): quota meters for marketing + current-month overage estimate.

### 12.2 Stripe Billing Portal

For payment-method updates, invoice history, tax-id management, and **multiple-payment-methods-on-file management (set default, add new, detach old)**, redirect to a Stripe Billing Portal session (`stripe.billingPortal.sessions.create`). Hosted by Stripe. Pre-configured features: update card, add additional cards, set default, view invoices, update tax ID, cancel subscription (we duplicate cancel in our UI for the one-click promise — both paths work).

Tavli's `payment_methods` table mirrors what Stripe holds; the `is_default` flag is synced via the `customer.updated` webhook event (specifically when `default_payment_method` changes). The Tavli partner portal shows the current default on the billing dashboard with "Manage cards" → Billing Portal as the only mutation path. We don't build our own multi-card management UI — Stripe's is good enough.

### 12.3 Trial countdown banner

When subscription is `trialing` + within 14 days of end: banner across partner portal — "Your free trial ends in N days. We'll auto-charge your card €X on DD MMM."

Dismissible per-session but reappears on next login.

### 12.4 Past-due / unpaid banners

When status is `past_due` or `unpaid`: prominent red banner with "Update payment method" CTA.

## 13. Background jobs

All job keys live in the foundations `JOBS.billing.*` registry (§16.3). Never hard-code job-name strings outside the registry.

| `JOBS.billing.*` key | Schedule / trigger | Purpose |
|---|---|---|
| `sendReminderDay60` | scheduled at signup, fires day 60 | "You're on day 60 of your free trial" email. |
| `sendReminderDay75` | same | Day 75 email. |
| `sendReminderDay85` | same | Day 85 email + recap of features used. |
| `syncStripeSubscription` | nightly per org | Defence-in-depth: re-fetch each active subscription from Stripe, reconcile mirror. Surfaces drift; bypasses the §3.5 cache. |
| `reportMarketingOverage` | first of each month at 02:00 UTC | Per §9.1: report Stripe metered-usage records for prior-month SMS + WhatsApp overage. |
| `expireOrphanIncomplete` | hourly | Delete `incomplete` subscriptions older than 24h with no payment method. |
| `archiveCancelledOrgs` | nightly | After 30 days post-cancellation, set `organizations.status = 'suspended'`, block write APIs. |
| `applyPendingFrequencyChanges` | every 30 min | Apply queued monthly ↔ annual frequency switches at period end (§8.3). |
| `enforceDunningTier` | every 6 hours | Walk subscriptions in `past_due`; transition day-7 → soft-lock, day-21 → read-only (§11.5). |

Stripe webhook processing is not a discrete job — the inbound webhook is handled synchronously by the foundations `ingestWebhook` handler (§6.6) and the foundation's stuck-row sweeper (`JOBS.webhook.reingestUnprocessed`) covers retries.

## 14. Tools & libraries

- `stripe@17.x` (Stripe Node SDK). Per `00-foundations.md` §17.8.
- No new dependencies beyond §00.

## 15. Compliance & audit

### 15.1 ANPC + RO accounting

- Stripe issues legally-compliant RO VAT invoices when Stripe Tax is enabled + the customer's tax_id + address are RO.
- **Invoice numbering**: Stripe-issued invoice numbers (`IN-0123...`) are acceptable for RO ANPC per prior accountant guidance. **Verify with the accountant before go-live**; the operational risk is that ANPC may require a single per-issuer sequential RO-format series (`Factura RO-XXXX/2026`). If the accountant requires that, post-process Stripe PDFs with a RO-specific overlay (a separate PDF generation pass that watermarks the Stripe-issued PDF with `Factura RO-XXXX/YYYY` on a defined invoice-area), and track the RO-overlay mapping in a new table `billing_invoice_overlays` (`invoice_id → ro_overlay_number, overlay_pdf_storage_path, overlay_generated_at`). The table is empty by default; populated only if the overlay path is taken.
- **e-Factura (B2B)**: per foundations §15a.6, mandatory B2B e-invoicing in RO from 2024. B2B customers may require post-processing into RO SPV (Spațiul Privat Virtual ANAF). Stripe invoices satisfy ANPC for B2C SaaS directly. The e-Factura submission pipeline is `docs/operations/e-factura-submission.md` — out of v1 scope unless a B2B customer demands it; defer to v1.5.
- For ANPC inspection: Stripe-hosted PDFs are downloadable; `billing_audit_log` provides the actor + timeline trail.

### 15.2 PCI

- No card data ever touches Tavli's servers — Stripe Elements / Checkout handles it client-side.
- `payment_methods` stores only the last 4 + brand + exp (Stripe-provided summary).

### 15.3 GDPR cascades

When a diner's anonymisation fires (§03 §8.2), it does not affect billing data — billing is org-level, not diner-level. Org-level deletion (§13) cascades: cancel subscription, delete `payment_methods`, retain `invoices` + `billing_audit_log` for the legally-required 7-year accounting retention (RO Codul Fiscal).

#### 15.3.1 GDPR-erasure on billing PII (resolves the 7-year vs Art-17 conflict)

Per foundations §15a.1, the canonical erasure pattern is "redacted_at marker + erasure_log" — never in-place JSONB regex. When a data subject (typically an operator who once authorised a payment) requests GDPR Art 17 erasure and PII appears inside `billing_audit_log`:

1. **Set `billing_audit_log.redacted_at = now()`** on every row containing the requester's PII (resolved via `actor_user_id` lookup or by matching `context->>'actor_email'`).
2. **Anonymise actor-PII columns**: null `context.actor_email`, `context.actor_name`, `context.actor_phone` (the JSONB is rewritten — but only these named keys; the rest of `context` stays as-is because it's transaction data, not PII). The handler uses targeted JSONB key removal (`context = context - 'actor_email' - 'actor_name' - 'actor_phone'`), **not** a regex sweep.
3. **Keep transaction data**: `event_type`, `stripe_invoice_id`, `amount`, `currency`, `occurred_at` — these are fiscal records under RO Codul Fiscal's 7-year retention and survive Art 17 (Art 17(3)(b): legal obligation to retain).
4. **Insert an `erasure_log` row** per foundations §15a.1 — `table_name = 'billing_audit_log'`, `fields_erased = ['actor_email','actor_name','actor_phone']`, `reason = 'gdpr_art_17'`.
5. **Nightly verification job** (per foundations §15a.1) re-reads the redacted rows and confirms the listed fields are null; Sentry-alerts on residual PII.

The 7-year fiscal retention applies to **transaction data**, not personal identifiers. This pattern reconciles the apparent conflict.

## 16. Build sequence

1. **Schema migration** for all billing tables + enums + RLS. *(1 day)*
2. **Stripe SDK install + env config** (per `00-foundations.md` §17.8). *(0.3 day)*
3. **Stripe products + prices seed script** (idempotent — checks if products exist before creating). *(0.5 day)*
3a. **`tax_behavior` assertion in seed script**: after creating/updating Stripe prices, the script asserts every Tavli Stripe price has `tax_behavior = 'exclusive'` (per §3.6.3). Throws + exits non-zero if any price violates the rule. Wired into CI as `npm run verify:stripe-prices`; fails the deploy if violated. *(0.2 day)*
4. **`startSubscription` action** + Stripe Customer + Subscription + Checkout setup. *(2 days)*
5. **Stripe webhook handler** (`/api/webhooks/stripe/route.ts`) with signature verification + idempotency via `webhook_events`. *(1.5 days)*
6. **Webhook event router** — one handler per relevant event type, mirroring to local tables. *(2 days)*
7. **Day-60 / 75 / 85 reminder jobs + email templates** (templates in §04). *(1 day)*
8. **Billing dashboard UI** — plan summary, card display, invoice list, usage meters. *(2 days)*
9. **Stripe Billing Portal integration** — session creation + return URL handling. *(0.5 day)*
10. **Cancellation flow** — UI + `cancelSubscription` action + reason capture + audit log + email + data-export trigger. *(2 days)*
11. **Pro-rata refund** on annual prepay cancellation. *(0.5 day)*
12. **Per-additional-location quantity sync** — hook from §09's add/remove venue actions. *(1 day)*
13. **Tier upgrade / downgrade** — UI + actions + Stripe item swap + proration. *(1.5 days)*
14. **Frequency switch** (monthly ↔ annual) — UI + deferred-to-period-end mechanism. *(1 day)*
15. **Marketing overage reporting** — daily job from §11. *(1 day)*
16. **Dunning flow** — past_due → unpaid transitions + lockout middleware + recovery flow. *(1.5 days)*
17. **Nightly Stripe sync job** — reconcile mirror. *(0.5 day)*
18. **Trial countdown + past-due banners** in partner portal. *(0.5 day)*
19. **Archive cancelled-org job** + read-only mode middleware. *(1 day)*
20. **One-trial-per-tax-id enforcement** wiring from §01 signup + `updateOrgTaxId`. *(0.5 day)*
21. **Visual regression + integration tests** — Stripe test-mode E2E. *(1 day)*

**Total: ~22 working days.** Heaviest: webhook event router (step 6) + billing dashboard UI (step 8) + cancellation flow (step 10).

## 17. Open questions

1. **Stripe Tax registration in RO — register or self-remit?** Recommendation: register via Stripe Tax for v1 (~€20/month overhead, but Stripe files; saves operational lift at <€50k MRR). Switch to self-remit if/when Stripe Tax cost > accountant cost.

2. **Should trial cancellation refund the (zero) charge?** Trial means no charge yet, so nothing to refund. Recommendation: "Cancel during trial" just sets `cancel_at_period_end` with the period being the trial. Org keeps access until day 91 then everything stops. No charge ever.

3. **Should orgs that cancelled before day 91 be eligible for a re-trial later?** Recommendation: no per the "one trial per legal entity" promise. The signup `JOIN organizations ↔ subscriptions WHERE trial_started_at is not null` (§01 §8) blocks re-signup — any consumed trial counts, regardless of subsequent cancellation. Exception: Tavli admin can manually grant a re-trial in good-faith cases (e.g., the operator cancelled while travelling and missed reminders). The admin tool flips a `re_trial_granted` flag on the org which the JOIN check honours.

4. **What about prorated refunds when an annual subscriber upgrades mid-year?** Recommendation: Stripe handles proration natively (`proration_behavior: 'create_prorations'`). The upgrade generates a prorated credit for the unused base portion + a prorated charge for the upgraded portion. Net is reflected in the next invoice.

5. **Currency expansion** — DE is in the eurozone; German orgs pay EUR same as RO orgs (RON only enters if/when we sell to non-eurozone EU markets like Poland or Czechia). Multi-currency support deferred until we sell outside the eurozone. **Resolved (2026-05-20): EUR-only for v1; no multi-currency work required.**

6. **Dunning grace period** — ~~21 days seems long. Recommendation: tier the strictness. After 7 days, soft-lock writes. After 21 days, full read-only.~~ **Resolved (2026-05-20): adopted in §11.5.** Day 0–6 = full access + banner; day 7 = soft-lock writes (but diner bookings remain unaffected — diner protection clause); day 21 = full read-only. Diner experience never degrades during the operator's billing lapse.

7. **Should we offer ACH / SEPA Direct Debit for annual prepays?** Lower transaction fees vs cards (~0.8% vs ~2.5%). Recommendation: yes for annual prepays specifically (the larger transaction makes the fee gap material). Cards default for monthly.

8. **Per-additional-location billing — should venues count their own staff time as part of the value (per §09 economics)?** Recommendation: no — staff time isn't a billable axis. The €15 per extra venue covers added platform usage; that's the contract.

9. **What about "concierge" pricing for 10+ venue chains (per `09-multi-location.md` §12.5)?** Recommendation: not built into the standard data model. Tavli admin sets `organizations.max_venues` + overrides Stripe subscription with custom pricing via the Stripe Dashboard. Bespoke deals don't need product support.

10. **Receipt customisation** — can restaurants add their logo to Stripe-hosted invoices? Recommendation: Stripe supports limited branding via the Stripe Dashboard. Not per-restaurant per-invoice; brand-level. Configure Tavli's brand on Stripe; that's what appears.

## 18. Cross-references

- **§00 Foundations §3.4** — `can()`/`requireCan()` for `'subscription.cancel'`, `'subscription.upgrade'`, `'billing.read'`.
- **§00 Foundations §6.6** — `webhook_events` table + `ingestWebhook` skeleton; this domain does NOT redeclare the table.
- **§00 Foundations §7.1** — SMS wrapper used for Pro-tier billing-failure SMS escalation (§11 step 4).
- **§00 Foundations §15a.1** — GDPR Art-17 erasure pattern applied to `billing_audit_log` PII (§15.3.1).
- **§00 Foundations §15a.2** — PSD2 / SCA recital-15 evidence requirement; satisfied via §7.3 audit log row.
- **§00 Foundations §15a.6** — ANPC + EU VAT / VIES / e-Factura; B2B-vs-B2C disclosure rules (§3.6.1).
- **§00 Foundations §16.1 / §16.2 / §16.3** — `ERROR_CODES` (TV1000–TV1099), `AUDIT.billing.*`, `JOBS.billing.*`.
- **§00 Foundations §17.8** — Stripe SDK install + Connect onboarding stub; this doc builds the subscription product on top.
- **§01 Identity & accounts §5.2 / §8** — `signupPartner` invokes `startSubscription`; tax_id uniqueness + one-trial-per-CUI JOIN enforced at signup; `customer_type` radio captured before plan selection (§3.6.2).
- **§02 Bookings** — no direct dependency. Bookings continue under contract even when the operator is `past_due` or `unpaid` (§11.6 diner-protection clause).
- **§03 Diner database §8.2** — diner pseudonymisation is independent of billing data.
- **§04 Diner communication** — `RecurringChargeConsentEmail`, `SubscriptionCancelledEmail`, `TrialEndingEmail` (day 60/75/85), `PaymentFailedEmail`, `RefundIssuedEmail` templates.
- **§07 Analytics & reports** — final data export on cancellation pulls from §07.
- **§09 Multi-location §5.1** — `addVenueToOrg` / `archiveVenue` triggers `syncExtraLocationQuantity` (§8.1).
- **§10 Corporate events §7.3** — invoice-numbering compliance pattern; Stripe Connect is *separate* from this domain's platform subscriptions; both can coexist on the same `stripe_customer_id` if the org runs both (rare).
- **§11 Marketing suite §14** — monthly overage computation feeds the `JOBS.billing.reportMarketingOverage` job; quota allowance ties to Pro tier.
- **§13 Compliance & legal** — final data export on cancellation; billing retention rules (7-year RO Codul Fiscal); audit log retention; cancellation-grace orchestration; nightly Stripe-reconciliation drift detection.

---

*Last updated: 2026-05-20.*
