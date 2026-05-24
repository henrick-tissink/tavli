# Wave 5 sub-unit D — §12 Stripe webhook router (design)

> The inbound Stripe webhook surface: `/api/webhooks/stripe` verifying the
> signature + routing through the foundations `ingestWebhook` (layer-1
> idempotency), a per-event dispatcher that mirrors Stripe → local tables with
> layer-2 (`billing_audit_log`) idempotency (§6.3.1), and the
> `setup_intent.succeeded` handler that attaches the card + **sends** the
> `RecurringChargeConsentEmail` (built in W5-C) + writes the PSD2 audit.
> **No keys** — `verifyStripeSignature` + handlers are unit-tested against
> mocked `Stripe.Event` objects.

**Date:** 2026-05-24
**Build-order line:** §12 Stripe webhook router with two-layer idempotency (§6.3.1)
**Source:** `12-billing-and-subscriptions.md` §6.3, §6.3.1, §6.3.2, §7.2, §7.3.

## 1. Scope (build + unit-test; no keys)

1. **`src/lib/billing/stripe-webhook-router.ts`** — `makeStripeWebhookRouter(deps)`
   → `handle(event: Stripe.Event)`, dispatching by `event.type` to mirror
   handlers. DI: `db`, `recordBillingAudit`, `wasEventApplied`, `sendEmail`,
   `render`. Each status-mutating handler is **layer-2 idempotent**: it calls
   `wasEventApplied(stripeEventId)` (queries `billing_audit_log` for a prior row
   whose `context->>'stripe_event_id'` matches) and short-circuits if applied.
2. **`src/app/api/webhooks/stripe/route.ts`** — `POST`: read raw body +
   `stripe-signature` header → `verifyStripeSignature` → map to `VerifyResult`
   → `ingestWebhook({ provider: 'stripe', verifySignature, handle: router.handle })`.
3. **Event handlers** (the §6.3 table — core set):
   - `customer.subscription.created` → UPSERT `subscriptions` on
     `stripe_subscription_id` (idempotent vs the W5-C insert).
   - `customer.subscription.updated` → mirror status (Stripe→local enum),
     period dates, `cancel_at_period_end`; sync item quantities. Layer-2 dedup.
   - `customer.subscription.deleted` → status `cancelled` + `cancelled_at`.
   - `invoice.created` → insert `invoices` (status `draft`).
   - `invoice.finalized` → status `open` + `amount_due`.
   - `invoice.paid` → status `paid` + `paid_at`; audit `payment_succeeded`.
   - `invoice.payment_failed` → status stays open; subscription → `past_due`
     (or `incomplete` if `authentication_required`); audit `payment_failed`.
     (Dunning emails/lockout are W5-G; this sets the state + audit.)
   - `invoice.voided` → status `void`.
   - `payment_method.attached` → insert `payment_methods`.
   - `payment_method.detached` → set `detached_at`.
   - `setup_intent.succeeded` (§7.2 locked contract) → validate
     `metadata.subscription_id`; map to local subscription (defer via 500 if not
     found — ingestWebhook retries); set `default_payment_method` on the Stripe
     sub + mirror; **send `RecurringChargeConsentEmail`** if `consent_email_sent_at
     IS NULL`, set it; audit `setup_intent_succeeded` + `psd2_consent_captured`.
   - `charge.dispute.created` → audit `dispute_opened` (+ Sentry alert).
   - `charge.refunded` → audit `refund_issued` + reflect in `invoices.amount_paid_cents`.
   - unknown types → no-op 200 (logged).

## 2. Out of scope
- Dunning emails + tiered lockout (W5-G; this sub-unit only sets `past_due`/`incomplete` + audit).
- `customer.subscription.trial_will_end` email — the W5-C day-85 reminder already covers it; handler no-ops (avoids double-notify).
- Billing UI / banners (§15/W5-E).

## 3. Layer-2 idempotency (§6.3.1)

`wasEventApplied(stripeEventId): Promise<boolean>` — `select 1 from billing_audit_log
where context->>'stripe_event_id' = $1 limit 1`. Every status/invoice-mutating
handler writes a `billing_audit_log` row carrying `stripe_event_id` in `context`
and short-circuits on a prior match. Layer 1 (`webhook_events` unique
provider+id) stops duplicate HTTP deliveries; layer 2 stops a re-applied
transition even if a crash left `webhook_events` inserted but the mirror
un-updated and the row was replayed by the sweeper.

## 4. Status mapping
Reuse the Stripe→local-enum mapping from W5-C (`mapStripeStatus`); extract it to
`src/lib/billing/stripe-status.ts` so both `start-subscription.ts` and the router
import one copy (DRY). `authentication_required` on `invoice.payment_failed` →
local `incomplete` (not `past_due`), per §7.3 step 3.

## 5. Testing (no keys)
Jest, mocked `Stripe.Event` payloads + DI:
- route: invalid signature → 400; valid → ingestWebhook path (mock ingest).
- each handler: applies the right mirror mutation + writes the right audit key;
  `wasEventApplied` true → handler short-circuits (no mutation).
- `setup_intent.succeeded`: missing `metadata.subscription_id` → throws (→500);
  sub not found → throws (→500 retry); happy path attaches PM + sends consent
  email once (consent_email_sent_at guard) + writes both audits.
- `mapStripeStatus`: `canceled`→`cancelled`, `authentication_required` branch.

## 6. Risks / notes
- **No keys:** `verifyStripeSignature` throws without `STRIPE_WEBHOOK_SECRET`;
  the route maps that to 400 via `ingestWebhook`'s `verifySignature` returning
  `{ok:false}`. Handlers never call Stripe except `setup_intent.succeeded`
  (sub.update default_payment_method) — injected client, mocked in tests.
- **W5-C dependency:** the router mirrors into the W5-B tables and complements
  W5-C's `startSubscription` (the `customer.subscription.created` UPSERT must
  not crash on the row W5-C already inserted — idempotent on conflict).
- **No migration.** Uses existing tables. `webhook_events` is foundations §6.6.
