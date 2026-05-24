# Wave 5 sub-unit C — §12 startSubscription + trial start (design)

> The trial-start orchestration: `startSubscription` (§7.1) creating the Stripe
> Customer + Subscription (90-day trial, card-on-file via Checkout setup-mode)
> + the local mirror rows + the day-60/75/85 reminder jobs + the billing-audit
> trail; the `billing_audit_log` writer; the trial/PSD2 email templates; and a
> forward-declared activation seam in `/onboard` completion. **No Stripe keys
> needed** — every Stripe call goes through an injected client and is unit-tested
> against a mock. **No webhooks** (the `setup_intent.succeeded` handler that
> attaches the card + sends the PSD2 email, and all status mirroring, are W5-D).

**Date:** 2026-05-24
**Build-order line (Wave 5):** §12 `startSubscription` (§7.1) + day-91 PSD2/SCA conversion (§7.3)
**Source architecture:** `docs/superpowers/architecture/12-billing-and-subscriptions.md` §6.3.2, §7.1, §7.2, §7.3, §13 (reminder jobs).

---

## 1. Scope

### In scope (build + unit-test; no keys)

1. **`src/lib/billing/billing-audit.ts`** — `recordBillingAudit(input, executor?)`
   writing a `billing_audit_log` row with BOTH `organization_id` and
   `organization_id_at_event` set (§4.6 two-column design); `event_type` typed
   to the `AUDIT.billing.*` registry keys. First writer to the table (created
   empty in W5-B). Optional `executor` for txn-atomic writes (mirrors `recordAudit`).
2. **`src/lib/billing/start-subscription.ts`** — `startSubscription` (§7.1),
   built with `make*({deps})` DI so the Stripe client, db, enqueue,
   recordBillingAudit are all injectable/mockable.
3. **Reminder job handlers** `src/lib/jobs/handlers/billing.ts` —
   `handleTrialReminder(day)` for day 60/75/85 (registry keys
   `JOBS.billing.sendReminderDay60/75/85` already exist) + `worker.ts`
   `boss.work` registration (NO cron — enqueued with `startAfter` by
   `startSubscription`).
4. **Email templates** (`src/emails/*.tsx`, RO/EN/DE, matching
   `DataDeletionConfirmedEmail`): `TrialEndingEmail` (parameterised by day) +
   `RecurringChargeConsentEmail` (PSD2 consent — §7.3 step 2).
5. **Forward-declared `/onboard` activation seam** — call `startSubscription`
   from `publishRestaurant` behind a `customer_type`-set guard (no-ops today;
   auto-activates when plan-selection UI lands in §15/W5-E).

### Out of scope

- `setup_intent.succeeded` handler (attach card, **send** RecurringChargeConsentEmail,
  write `psd2_consent_captured` audit) + `customer.subscription.*` / `invoice.*`
  status mirroring → **W5-D** (webhook router). W5-C ships the email *template*; W5-D sends it.
- Plan + `customer_type` capture UI → §15 pricing / W5-E billing UI.
- Billing dashboard, cancellation, tier swap, dunning → W5-E/F/G.

## 2. `recordBillingAudit` (§4.6 / §6.3.2)

```ts
// src/lib/billing/billing-audit.ts
import { billingAuditLog } from "@/lib/db/schema";
import { dbAdmin } from "@/lib/db/admin";

export type BillingAuditEventType =
  | "billing.subscription_created" | "billing.subscription_updated"
  | "billing.subscription_upgraded" | "billing.subscription_cancelled"
  | "billing.frequency_change_requested" | "billing.frequency_changed"
  | "billing.payment_succeeded" | "billing.payment_failed"
  | "billing.refund_issued" | "billing.setup_intent_succeeded"
  | "billing.psd2_consent_captured" | "billing.dispute_opened";

export interface RecordBillingAuditInput {
  organizationId: string;
  eventType: BillingAuditEventType;
  actorUserId?: string | null;
  context: Record<string, unknown>;
}
export type BillingAuditExecutor = Pick<typeof dbAdmin, "insert">;

export async function recordBillingAudit(
  input: RecordBillingAuditInput,
  executor: BillingAuditExecutor = dbAdmin,
): Promise<void>
```

Sets `organization_id = organization_id_at_event = input.organizationId`,
`event_type = input.eventType`, `actor_user_id`, `context`. Event-type values
come straight from `AUDIT.billing.*`; the union type prevents free-string keys
(§6.3.2 "never invent a free-string action key"). No PII-key scan is applied
(billing context legitimately carries Stripe ids/amounts; GDPR erasure of
actor-PII is the §15.3.1 path, handled later).

## 3. `startSubscription` (§7.1)

```ts
// src/lib/billing/start-subscription.ts
export interface StartSubscriptionInput {
  organizationId: string;
  tier: "base" | "pro";
  frequency: "monthly" | "annual";
}
export interface StartSubscriptionDeps {
  stripe: Pick<Stripe, "customers" | "subscriptions" | "checkout">;
  db: typeof dbAdmin;
  enqueue: typeof enqueue;
  recordBillingAudit: typeof recordBillingAudit;
  now?: () => Date;        // injectable clock for deterministic trial_end tests
  siteUrl?: string;        // defaults to process.env.SITE_URL
}
export function makeStartSubscription(deps: StartSubscriptionDeps):
  (input: StartSubscriptionInput) => Promise<{ stripeCheckoutUrl: string }>
```

Logic (lib function **throws** TV-coded errors; callers wrap):
1. Load the org (id, taxId, customerType, stripeCustomerId, reTrialGranted).
   Throw `not_found` if absent.
2. **Trial-already-used guard** (§7.1 step 1): if a `subscriptions` row exists
   for this org with `trial_started_at IS NOT NULL` AND `re_trial_granted = false`
   → throw `TV1001 trial_already_used`.
3. **tax_id uniqueness** (§7.1 step 2): if `customerType = 'business'` and another
   org shares the same `(country_code, tax_id)` → throw `TV1002 tax_id_already_claimed`.
   (The DB partial unique index already enforces this on write; the explicit
   check gives the clean TV code before hitting Stripe.)
4. **customer_type guard** (§7.1 step 3, enforces the W5-B-deferred invariant):
   if `customerType IS NULL` → throw `invalid_input` (internal-bug guardrail;
   the caller must capture it first).
5. **Stripe Customer**: reuse `organizations.stripe_customer_id` if set; else
   `stripe.customers.create({ email: primaryContactEmail, name: legalName ?? name,
   metadata: { organization_id, customer_type }, tax_id_data: customerType==='business'
   ? [{ type: roOrEuVat(countryCode), value: taxId }] : undefined })`, then persist
   `stripe_customer_id` on the org.
6. **Stripe Subscription** (§7.1 step 5): `stripe.subscriptions.create({ customer,
   items: [{ price: priceIdForTierFrequency(tier, frequency) }, ...(tier==='pro'
   ? [{ price: priceIdForExtraLocation(frequency), quantity: 0 }] : [])],
   trial_end: unix(now + 90d), trial_settings: { end_behavior: { missing_payment_method:
   'pause' } }, payment_behavior: 'default_incomplete', payment_settings: {
   save_default_payment_method: 'on_subscription' }, automatic_tax: { enabled: true },
   metadata: { organization_id, tier, frequency } })`.
7. **Insert mirror rows** (one `db.transaction`): `subscriptions` (status from the
   Stripe sub — typically `trialing`/`incomplete`; trial_started_at = now,
   trial_ends_at = now+90d) + one `subscription_items` row per Stripe item
   (`base_tier`, and `extra_location` qty 0 for pro). The webhook UPSERT (W5-D)
   is idempotent against these (§6.3 `customer.subscription.created`).
8. **Checkout Session** (§7.2): `stripe.checkout.sessions.create({ mode: 'setup',
   customer, setup_intent_data: { metadata: { subscription_id, organization_id } },
   success_url: \`${siteUrl}/partner/onboarding?card=success\`, cancel_url:
   \`${siteUrl}/partner/onboarding?card=cancel\` })`.
9. **Enqueue reminders**: `enqueue(JOBS.billing.sendReminderDay60, { organizationId,
   subscriptionId }, { startAfter: trialStartedAt + 60d })` and likewise 75/85.
10. **Audit**: `recordBillingAudit({ organizationId, eventType: 'billing.subscription_created',
    context: { tier, frequency, stripe_subscription_id, stripe_customer_id } })`.
11. Return `{ stripeCheckoutUrl }`.

`roOrEuVat(countryCode)` → `'ro_vat'` when `countryCode === 'RO'`, else `'eu_vat'`
(per §7.1 step 4; VIES validation is §01's job, trusted here).

New error code: **`TV1007 = subscription_customer_type_missing`** is NOT added —
step 4 returns the cross-cutting `invalid_input` (it's an internal-bug guardrail,
not a user-facing condition). TV1001/TV1002 already exist.

## 4. Reminder jobs (§13)

`src/lib/jobs/handlers/billing.ts`: `makeTrialReminderHandler({ db, loadActiveSubscription, sendEmail, day })`
→ loads the org + subscription; if the subscription is gone or no longer
`trialing`, no-op (the operator already converted/cancelled); else render
`TrialEndingEmail({ day, trialEndsAt, locale })` → `sendTransactionalEmail`
with `templateKey = 'trial_ending_day_<day>'`. Handlers for 60/75/85 share the
factory. Registered in `worker.ts` via `boss.work` (no `boss.schedule` — these
fire from the `startAfter` enqueue in §3 step 9).

## 5. Email templates (§04 / §7.3)

`src/emails/TrialEndingEmail.tsx` — props `{ day: 60|75|85; trialEndsAt: Date;
chargeAmount?: string; locale }`; RO/EN/DE inline `COPY` (matches
`DataDeletionConfirmedEmail`). Day-85 copy includes the "we'll auto-charge on
DD MMM" line (§13 reminder table).

`src/emails/RecurringChargeConsentEmail.tsx` — props `{ locale; chargeDescription }`;
subject "Card on file at Tavli — recurring charge confirmation" (§7.3 step 2,
PSD2 recital-15 evidence). **Built here; SENT by W5-D's setup_intent handler.**

Both rendered to html via `@react-email/render` at the call site (reminder
handler for TrialEnding; W5-D for RecurringChargeConsent).

## 6. `/onboard` activation seam

In `publishRestaurant` (`src/app/onboard/[token]/review/actions.ts`), after the
restaurant is validated/published, resolve the org and call `startSubscription`
**only if** `organizations.customer_type IS NOT NULL` AND no active subscription
exists. Today `customer_type` is never set in onboard, so this is a no-op (logged
at debug). When §15/W5-E adds plan + customer_type capture, the trial starts
automatically — no rework. Default plan when unset-but-present: `base`/`monthly`
(the §3.4 default). Failure of `startSubscription` must NOT block publish — wrap
in try/catch, log, surface a non-fatal note (the restaurant still publishes; the
operator can start billing later from the billing dashboard).

## 7. Testing (no keys)

Jest, `@jest-environment node`, DI + mocks:
- `recordBillingAudit`: inserts a row with both org-id columns equal + the typed event_type.
- `startSubscription`: TV1001 (trial already used) / TV1002 (tax_id collision) /
  invalid_input (null customer_type) guards; reuses existing stripe_customer_id;
  creates Customer with tax_id_data only for business; creates Subscription with
  trial_end = now+90d (injected clock) + pro adds extra_location qty 0; inserts
  mirror rows in a txn; enqueues 3 reminders with correct startAfter; writes
  `subscription_created` audit; returns the checkout URL. All Stripe via a mock
  client returning canned ids.
- reminder handler: no-ops when subscription not `trialing`; sends TrialEndingEmail otherwise.
- templates: render to html for each locale without throwing; day-85 contains the charge-date line.
- `publishRestaurant`: startSubscription invoked when customer_type set; skipped (no throw) when null; publish still succeeds if startSubscription throws.

`npx tsc --noEmit` clean; lint baseline (test-mock `any` only).

## 8. Risks / notes

- **No keys:** all Stripe interaction is injected + mocked. The real run happens
  only when the operator has seeded prices (price-ids.ts throws otherwise) — which
  is fine because the `/onboard` seam no-ops until plan/customer_type capture lands.
- **Webhook dependency:** the subscription is created `payment_behavior:'default_incomplete'`;
  it becomes billable only after the card is attached (W5-D's setup_intent handler)
  and the trial converts (Stripe-native at trial_end). W5-C does not mirror status
  changes — that's W5-D. So a W5-C-created subscription sits at its initial status
  until W5-D ships. Acceptable for a build-ahead wave.
- **Stripe API version:** use the SDK types from the installed `stripe` package via
  the injected client; do not pin a new apiVersion (the §17.8 client owns that).
- **Local/prod DB:** no new migration in W5-C (uses W5-B's tables). Local DB has
  the billing tables (applied this session); prod queues behind the user batch.
