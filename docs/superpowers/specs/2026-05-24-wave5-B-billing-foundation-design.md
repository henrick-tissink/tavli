# Wave 5 sub-unit B — §12 billing foundation (design)

> The data + read substrate every later §12 sub-unit (C–G) and every
> tier-gated domain builds on: billing schema (enums + 5 tables + RLS),
> the env-backed Stripe price-id map, the idempotent Stripe products/prices
> seed script + `tax_behavior` CI assertion, and the **real**
> `loadActiveSubscription` helper that replaces the Wave 4 base-tier stub.
> **No subscription flows** — `startSubscription`/Checkout/webhooks/UI/
> mutations/dunning are W5-C…W5-G; marketing overage is Wave 7.

**Date:** 2026-05-24
**Build-order lines covered (Wave 5):**
- §12 Stripe products + prices seed script with `tax_behavior: 'exclusive'` assertion
- §12 `subscriptions` + `subscription_items` + `invoices` + `payment_methods` + `billing_audit_log`
- §12 `loadActiveSubscription` helper with React `cache()` memoization (§12 §3.5)

**Source architecture:** `docs/superpowers/architecture/12-billing-and-subscriptions.md`
§3.5, §3.6.2/3, §4.1–§4.6, §5, §8.1 (price-ids), §16 steps 1–3a.

---

## 1. Scope

### In scope

1. **Migration 0041** (next free number; prod-apply gated, queues behind the
   pending 0033–0040 batch per MEMORY):
   - 4 new enums: `subscription_tier`, `billing_frequency`,
     `subscription_status`, `subscription_item_kind`.
     (`org_customer_type` already shipped in Wave 2 migration 0017.)
   - `organizations.re_trial_granted boolean not null default false` (§4.1a).
   - 5 tables (full DDL in §2): `subscriptions`, `subscription_items`,
     `invoices`, `payment_methods`, `billing_audit_log` + their indexes + RLS.
   - Deferrable constraint `chk_active_org_has_customer_type` (§2.7).
2. **Drizzle schema mirror** in `src/lib/db/schema.ts` for all of the above.
3. **`src/lib/billing/price-ids.ts`** — env-backed price-id resolvers (§3).
4. **Stripe seed script** `scripts/seed-stripe-prices.ts` + the
   `verify:stripe-prices` assertion + tests against a mocked Stripe (§4).
   USER-run (needs `STRIPE_SECRET_KEY`); not executed by Claude.
5. **`src/lib/billing/load-subscription.ts`** — real `loadActiveSubscription`
   per the locked §3.5 contract (§5).
6. **Stub transition** (§6): delete `src/lib/billing/subscription-stub.ts`;
   update its 2 consumers to the real helper.

### Out of scope (later sub-units / waves)
`startSubscription` + Stripe Customer/Subscription/Checkout/SetupIntent + PSD2
consent email + day-60/75/85 reminders (W5-C); Stripe webhook router (W5-D);
billing dashboard + Billing Portal (W5-E); cancellation + pro-rata refund +
tier swap + frequency switch + per-location quantity sync (W5-F); dunning +
lifecycle jobs + banners (W5-G); marketing overage metering (§9 — Wave 7).

## 2. Data model (§4)

### 2.1 New enums (§4.1)

```sql
create type subscription_tier as enum ('base', 'pro');
create type billing_frequency as enum ('monthly', 'annual');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'unpaid', 'incomplete');
create type subscription_item_kind as enum ('base_tier', 'extra_location', 'sms_overage', 'whatsapp_overage');
```

### 2.2 organizations new column (§4.1a)

```sql
alter table organizations
  add column re_trial_granted boolean not null default false;
```

(`stripe_customer_id` + `customer_type` already exist from Wave 2.)

### 2.3 `subscriptions` (§4.2)

One row per org; mirrors the Stripe Subscription. Full column set per §4.2:
id, organization_id (FK→organizations, cascade), stripe_subscription_id
(unique), stripe_customer_id, tier, frequency (default 'monthly'), status,
status_synced_at, trial_started_at, trial_ends_at, trial_conversion_blocked_at,
current_period_start, current_period_end, cancel_at_period_end (default false),
cancelled_at, cancellation_reason, cancellation_requested_by_user_id
(FK→auth.users, set null), default_payment_method_stripe_id,
consent_email_sent_at, annual_paid_through, pending_frequency_change,
pending_frequency_effective_at, pending_frequency_requested_at,
pending_frequency_requested_by_user_id (FK→auth.users, set null),
created_at, updated_at.

Indexes per §4.2:
- partial unique `subscriptions_org_active` on `(organization_id)` where
  `status in ('trialing','active','past_due','unpaid')` — prevents two
  concurrent live subscriptions; cancelled/incomplete may coexist.
- `subscriptions_trial_ends` on `(trial_ends_at)` where `status='trialing'`.
- `subscriptions_current_period_end` on `(current_period_end)` where
  `status in ('active','past_due')`.
- `subscriptions_stripe_id` on `(stripe_subscription_id)`.

RLS: org-admin SELECT (org_members role in ('owner','admin')); service-role
mutations (no INSERT/UPDATE/DELETE policy).

### 2.4 `subscription_items` (§4.3)

id, subscription_id (FK→subscriptions, cascade), stripe_subscription_item_id
(unique), kind, stripe_price_id, quantity (default 1), unit_amount_cents,
currency (char(3) default 'EUR'), created_at, updated_at.
- partial unique `subscription_items_kind_unique` on `(subscription_id, kind)`
  where `kind in ('base_tier','extra_location')` (one each; overage kinds may
  recur historically).
- `subscription_items_subscription` on `(subscription_id)`.
RLS: org-admin SELECT scoped via the parent subscription's org; service-role mutations.

### 2.5 `invoices` (§4.4)

id, organization_id (FK→organizations, cascade), subscription_id
(FK→subscriptions, set null), stripe_invoice_id (unique), status (varchar(20)),
amount_due_cents, amount_paid_cents (default 0), tax_amount_cents (default 0),
currency (char(3)), hosted_invoice_url, invoice_pdf_url, period_start,
period_end, paid_at, voided_at, created_at.
Indexes: `invoices_org` on `(organization_id, created_at desc)`;
`invoices_subscription` on `(subscription_id, created_at desc)`;
`invoices_status` on `(status)`.
RLS: org-admin SELECT; service-role mutations.

### 2.6 `payment_methods` (§4.5)

id, organization_id (FK→organizations, cascade), stripe_payment_method_id
(unique), type (varchar(20)), card_brand, card_last4, card_exp_month
(smallint), card_exp_year (smallint), is_default (default false), created_at,
detached_at. Index `payment_methods_org` on `(organization_id)` where
`detached_at is null`. RLS: org-admin SELECT; service-role mutations.

### 2.7 `billing_audit_log` (§4.6) — two-column design (locked)

id, `organization_id` (FK→organizations, **on delete set null** — survives org
deletion for 7-yr RO Codul Fiscal), `organization_id_at_event` (uuid **not
null**, immutable denormalised snapshot — the column ANPC/forensic queries use),
event_type (varchar(60); canonical `AUDIT.billing.*` keys), actor_user_id
(FK→auth.users, set null), context (jsonb not null), occurred_at.
Indexes: `billing_audit_log_org` on `(organization_id, occurred_at desc)`;
`billing_audit_log_type` on `(event_type, occurred_at desc)`.
RLS: org-admin SELECT on `organization_id`; service-role inserts.
**No writes to this table in W5-B** (it's created here; W5-C+ write to it).

### 2.8 `chk_active_org_has_customer_type` (§4.1a)

§4.1a wants: no `subscriptions` row in
`('trialing','active','past_due','unpaid')` for an org with
`customer_type IS NULL`. This is a **cross-table** invariant (subscriptions ↔
organizations.customer_type), which Postgres cannot express as a row-level
`CHECK`, and foundations §4.3 forbids new triggers. **Resolution:** enforce it
in the `startSubscription` action (W5-C), which already verifies
`customer_type IS NOT NULL` before creating a subscription (§7.1 step 3). W5-B
does NOT add a DB trigger or constraint for this; the migration carries a
header comment documenting that the invariant is application-enforced. *(This
deliberately diverges from §4.1a's "deferrable constraint" wording to honor
§4.3; recorded in §9 risks.)*

### 2.9 webhook_events (§4.7)

NOT declared here — uses the foundations `webhook_events` + `ingestWebhook`
skeleton (§6.6). W5-D wires the Stripe handler.

## 3. Price-id resolvers (§5, §8.1)

`src/lib/billing/price-ids.ts` — a hard-coded map keyed by `(tier, frequency)`
plus the extra-location + overage prices, each value sourced from a
`process.env.STRIPE_PRICE_*` variable:

```ts
priceIdForTierFrequency(tier: 'base'|'pro', frequency: 'monthly'|'annual'): string
priceIdForExtraLocation(frequency: 'monthly'|'annual'): string
priceIdForOverage(kind: 'sms_overage'|'whatsapp_overage'): string
```

Env vars (per §5): `STRIPE_PRICE_BASE_MONTHLY`, `STRIPE_PRICE_BASE_ANNUAL`,
`STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_ANNUAL`,
`STRIPE_PRICE_EXTRA_LOCATION_MONTHLY`, `STRIPE_PRICE_EXTRA_LOCATION_ANNUAL`,
`STRIPE_PRICE_SMS_OVERAGE`, `STRIPE_PRICE_WHATSAPP_OVERAGE`. Resolvers throw a
clear error if the requested env var is unset (fail-loud, like
`getStripe()`). Documented in `.env.local.example`.

## 4. Stripe seed + verify (§5, §16 step 3/3a)

`scripts/seed-stripe-prices.ts` (USER-run with `STRIPE_SECRET_KEY`):
- Idempotent: look up each product by a stable `metadata.tavli_key` (or
  `lookup_key` on prices); create only if absent. Per §5 product/price table.
- All prices created with `tax_behavior: 'exclusive'`, EUR, correct recurring
  interval; annual = 10× monthly (2 months free, §1/§2).
- Prints the resulting price IDs for the operator to paste into `STRIPE_PRICE_*`.

`verify:stripe-prices` (npm script → `scripts/verify-stripe-prices.ts`):
- Fetches every Tavli price (by the `STRIPE_PRICE_*` envs) and asserts
  `tax_behavior === 'exclusive'`; exits non-zero on any violation (§3.6.3).
  Wired into CI per §16 step 3a.

Tests (`scripts/__tests__/` or `src/lib/billing/__tests__/`): the
`tax_behavior` assertion logic + idempotency branch unit-tested against a
**mocked Stripe client** (no live calls). The scripts themselves are
thin orchestration around tested pure functions.

## 5. `loadActiveSubscription` (§3.5 — locked contract)

`src/lib/billing/load-subscription.ts`:

```ts
export interface ActiveSubscriptionState {
  subscriptionId: string
  stripeSubscriptionId: string
  tier: 'base' | 'pro'
  status: subscription_status
  frequency: billing_frequency
  trial_ends_at: Date | null
  current_period_end: Date | null
  pending_frequency_change: billing_frequency | null
  items: Array<{ id: string; stripeSubscriptionItemId: string; kind: subscription_item_kind; quantity: number }>
}
export async function loadActiveSubscription(organizationId: string): Promise<ActiveSubscriptionState | null>
```

Contract (verbatim from §3.5):
- Returns `null` when: no `subscriptions` row for the org; OR the row exists but
  `organizations.stripe_customer_id IS NULL` (defensive orphan guard); OR the
  Postgres read fails (log to Sentry `level:'warning'`, **do not throw**).
- Reads the **local mirror only** — never calls Stripe.
- `items` array included so §8.1's quantity sync (W5-F) needs no second query.
- Wrapped in **React `cache()`** (same as `can()`); at most one Postgres hit
  per `organizationId` per request; failures are NOT retried within a request.
- "Active" row = `status in ('trialing','active','past_due','unpaid')` (matches
  the partial unique index); `cancelled`/`incomplete` are not "active".
- Built with the `make*({deps})` DI pattern so tests inject a fake db; the
  exported singleton wraps the real `dbAdmin` query in `cache()`.

## 6. Stub transition (§3.5 callers)

1. **Delete** `src/lib/billing/subscription-stub.ts` + its test.
2. **`src/app/api/photos/actions.ts`**: import from `@/lib/billing/load-subscription`;
   change `const isProActive = subscription.tier === "pro"` →
   `const isProActive = subscription?.tier === "pro"` (null → base cap). The
   photo-cap semantics are unchanged today (helper returns null until W5-C).
3. **`src/lib/multi-location/venue-actions.ts`**: the `loadActiveSubscription`
   DI default becomes the real helper; the `VenueActionsDeps.loadActiveSubscription`
   type becomes `(orgId) => Promise<{ tier: 'base'|'pro' } | null>` (loose — the
   action only reads `.tier`); the gate becomes
   `const tier = sub?.tier ?? 'base'; if (tier === 'base') throw TV701`. Update
   the W5-A tests' injected fakes to the `{tier:'pro'} | null` shape (happy-path
   fakes already return `{tier:'pro'}`; add a `null → TV701` case).

No behavior change in production today: with zero subscription rows, the real
helper returns `null` everywhere, so every org reads as free/base — identical
to the stub's `{tier:'base'}`.

## 7. Foundations registry

- ERROR_CODES: TV1001–TV1006 already exist (§12 range). **No additions** in W5-B
  (those codes are consumed by W5-C+; `loadActiveSubscription` returns null, never
  throws a TV code).
- AUDIT.billing.*: already fully populated (Wave 1). No additions.
- JOBS.billing.*: already populated. No new jobs in W5-B (reminder/sync jobs are
  W5-C/W5-G).

## 8. Testing

Jest, `@jest-environment node`, DI + chained-mock `db` (same idiom as W5-A):
- `loadActiveSubscription`: returns mapped state for an active row; returns null
  for no-row / null-stripe_customer_id / db-throw (defensive); excludes
  cancelled/incomplete; maps the `items` array.
- `price-ids`: resolvers return the env value; throw when env unset.
- Stripe `tax_behavior` assertion: passes when all exclusive; throws/exits
  non-zero when any price is non-exclusive (mocked Stripe).
- `photos/actions` + `venue-actions`: updated tests green with the real-helper
  shape (null → base path).
`npx tsc --noEmit` clean; lint at baseline (test-mock `any` only).

## 9. Risks / notes

- **`chk_active_org_has_customer_type` realised in app code, not a DB trigger**
  (§2.8) — honors foundations §4.3 (no new triggers); enforcement lives in
  W5-C's `startSubscription`. Divergence from §4.1a's "deferrable constraint"
  wording, deliberately.
- **Stripe seed is USER-run** — needs `STRIPE_SECRET_KEY`; Claude ships +
  unit-tests it but does not execute it. price-ids resolvers fail-loud until the
  operator sets `STRIPE_PRICE_*` after seeding. This is the migration-apply
  convention applied to Stripe.
- **`loadActiveSubscription` returns null until W5-C** creates subscription
  rows; all tier-gated features read as free/base in the interim (matches
  today's stub). Documented in code.
- **Prod migration ordering:** 0041 ships as a file; prod-apply queues behind
  the pending 0033–0040 batch (user-triggered). Local test DB is stale (see
  MEMORY) — 0041 schema additions are additive and won't run cleanly locally
  until the DB is re-migrated; unit tests use mocked db so they're unaffected.
- **`org_customer_type` enum reuse:** the new enums must NOT redeclare
  `org_customer_type` (exists since 0017).
