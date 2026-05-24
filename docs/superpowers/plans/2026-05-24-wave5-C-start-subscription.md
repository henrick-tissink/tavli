# Wave 5 sub-unit C — §12 startSubscription + Trial Start — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** Build the §12 trial-start orchestration (`startSubscription`), the `billing_audit_log` writer, the day-60/75/85 reminder jobs + templates, the PSD2 consent email template, and a forward-declared `/onboard` activation seam. No Stripe keys — all Stripe calls are injected + mocked.

**Architecture:** `make*({deps})` DI throughout. `startSubscription` orchestrates Stripe Customer + Subscription + Checkout (setup-mode) + mirror-row inserts + reminder enqueue + audit, returning a Checkout URL. Reminder handlers render React-Email templates and send via `sendTransactionalEmail`. The onboard seam no-ops until plan/customer_type capture lands (§15/W5-E).

**Tech Stack:** Stripe Node SDK (injected), Drizzle, pg-boss (`enqueue` + `boss.work`), `@react-email/render`, Jest (mocked clients).

**Spec:** `docs/superpowers/specs/2026-05-24-wave5-C-start-subscription-design.md`

**Out of scope:** setup_intent.succeeded + status-mirror webhooks (W5-D); plan/customer_type capture UI (§15/W5-E); billing dashboard/cancellation/dunning (W5-E/F/G).

---

## File Structure
- `src/lib/billing/billing-audit.ts` + `__tests__/billing-audit.test.ts` — **create**.
- `src/lib/billing/start-subscription.ts` + `__tests__/start-subscription.test.ts` — **create**.
- `src/lib/jobs/handlers/billing.ts` + `__tests__/billing.test.ts` — **create**.
- `scripts/worker.ts` — **modify**: register the 3 reminder handlers.
- `src/emails/TrialEndingEmail.tsx`, `src/emails/RecurringChargeConsentEmail.tsx` + `__tests__/` — **create**.
- `src/app/onboard/[token]/review/actions.ts` — **modify**: activation seam.

---

## Task 1: `recordBillingAudit`

**Files:** Create `src/lib/billing/billing-audit.ts` + `src/lib/billing/__tests__/billing-audit.test.ts`.

- [ ] **Step 1: Failing test** — `src/lib/billing/__tests__/billing-audit.test.ts`:

```ts
/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ billingAuditLog: {} }));

import { recordBillingAudit } from "../billing-audit";

describe("recordBillingAudit", () => {
  it("inserts a row with both org-id columns equal + the typed event_type", async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    const executor = { insert: jest.fn().mockReturnValue({ values }) } as any;
    await recordBillingAudit(
      { organizationId: "org-1", eventType: "billing.subscription_created", actorUserId: "u1", context: { tier: "pro" } },
      executor,
    );
    expect(executor.insert).toHaveBeenCalled();
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        organizationIdAtEvent: "org-1",
        eventType: "billing.subscription_created",
        actorUserId: "u1",
        context: { tier: "pro" },
      }),
    );
  });
});
```

- [ ] **Step 2: Run → fail** (`npx jest src/lib/billing/__tests__/billing-audit.test.ts`).

- [ ] **Step 3: Implement** — `src/lib/billing/billing-audit.ts`:

```ts
import "server-only";
import { dbAdmin } from "@/lib/db/admin";
import { billingAuditLog } from "@/lib/db/schema";

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

/**
 * §12 §4.6 / §6.3.2 — append-only billing event trail. Writes both
 * organization_id (FK, set-null on org delete) and organization_id_at_event
 * (immutable snapshot). event_type is constrained to the AUDIT.billing.* union.
 */
export async function recordBillingAudit(
  input: RecordBillingAuditInput,
  executor: BillingAuditExecutor = dbAdmin,
): Promise<void> {
  await executor.insert(billingAuditLog).values({
    organizationId: input.organizationId,
    organizationIdAtEvent: input.organizationId,
    eventType: input.eventType,
    actorUserId: input.actorUserId ?? null,
    context: input.context,
  });
}
```

- [ ] **Step 4: Run → pass.**
- [ ] **Step 5: Commit** — `feat(billing): recordBillingAudit writer for billing_audit_log (§12 Wave 5 sub-unit C.1)`.

---

## Task 2: `startSubscription`

**Files:** Create `src/lib/billing/start-subscription.ts` + `src/lib/billing/__tests__/start-subscription.test.ts`.

- [ ] **Step 1: Failing test** — covers the happy path + guards. `src/lib/billing/__tests__/start-subscription.test.ts`:

```ts
/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ organizations: {}, subscriptions: {}, subscriptionItems: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn(), and: jest.fn(), ne: jest.fn(), isNotNull: jest.fn(), sql: Object.assign(jest.fn(), { raw: jest.fn() }) }));
jest.mock("@/lib/billing/price-ids", () => ({
  priceIdForTierFrequency: jest.fn(() => "price_tier"),
  priceIdForExtraLocation: jest.fn(() => "price_extra"),
}));
jest.mock("@/lib/jobs/keys", () => ({ JOBS: { billing: { sendReminderDay60: "billing.send-reminder-day-60", sendReminderDay75: "billing.send-reminder-day-75", sendReminderDay85: "billing.send-reminder-day-85" } } }));

import { makeStartSubscription } from "../start-subscription";

const NOW = new Date("2026-05-24T00:00:00Z");
const ORG = { id: "org-1", name: "Tom Yum", legalName: "Tom Yum SRL", countryCode: "RO", taxId: "RO123", customerType: "business", stripeCustomerId: null, reTrialGranted: false, primaryContactEmail: "a@b.ro" };

function makeDb(over: any = {}) {
  const db: any = {
    _q: over.q ?? [], // FIFO of select results
    select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => Promise.resolve(db._q.length ? db._q.shift() : [])) })) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
    insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue(undefined) })),
    transaction: jest.fn(async (cb: any) => cb(db)),
  };
  return db;
}
function deps(over: any = {}) {
  return {
    stripe: {
      customers: { create: jest.fn().mockResolvedValue({ id: "cus_new" }) },
      subscriptions: { create: jest.fn().mockResolvedValue({ id: "sub_new", status: "trialing", items: { data: [{ id: "si_base", price: { id: "price_tier" } }] } }) },
      checkout: { sessions: { create: jest.fn().mockResolvedValue({ url: "https://checkout.test/x" }) } },
    },
    db: makeDb({ q: [[ORG], []] }), // 1st select: org; 2nd: existing-sub guard (none)
    enqueue: jest.fn().mockResolvedValue("job-id"),
    recordBillingAudit: jest.fn().mockResolvedValue(undefined),
    now: () => NOW,
    siteUrl: "https://tavli.ro",
    ...over,
  };
}

describe("startSubscription", () => {
  it("creates customer + subscription + checkout, inserts mirror, enqueues 3 reminders, audits, returns url", async () => {
    const d = deps();
    const start = makeStartSubscription(d as any);
    const res = await start({ organizationId: "org-1", tier: "pro", frequency: "monthly" });
    expect(res.stripeCheckoutUrl).toBe("https://checkout.test/x");
    expect(d.stripe.customers.create).toHaveBeenCalled();
    expect(d.stripe.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({ payment_behavior: "default_incomplete" }));
    expect(d.enqueue).toHaveBeenCalledTimes(3);
    expect(d.recordBillingAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "billing.subscription_created" }));
  });

  it("throws TV1001 when a trial was already used", async () => {
    const d = deps({ db: makeDb({ q: [[ORG], [{ id: "sub-old" }]] }) }); // existing-sub guard hits
    const start = makeStartSubscription(d as any);
    await expect(start({ organizationId: "org-1", tier: "base", frequency: "monthly" })).rejects.toThrow(/TV1001/);
  });

  it("throws invalid_input when customer_type is null", async () => {
    const d = deps({ db: makeDb({ q: [[{ ...ORG, customerType: null }], []] }) });
    const start = makeStartSubscription(d as any);
    await expect(start({ organizationId: "org-1", tier: "base", frequency: "monthly" })).rejects.toThrow(/invalid_input/);
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** `src/lib/billing/start-subscription.ts` per spec §3. Key shape:

```ts
import "server-only";
import type Stripe from "stripe";
import { and, eq, isNotNull } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { organizations, subscriptions, subscriptionItems } from "@/lib/db/schema";
import { enqueue as defaultEnqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";
import { priceIdForTierFrequency, priceIdForExtraLocation } from "@/lib/billing/price-ids";
import { recordBillingAudit as defaultRecordBillingAudit } from "@/lib/billing/billing-audit";

const TRIAL_DAYS = 90;
const DAY_MS = 86_400_000;

export interface StartSubscriptionInput { organizationId: string; tier: "base" | "pro"; frequency: "monthly" | "annual"; }
export interface StartSubscriptionDeps {
  stripe: Pick<Stripe, "customers" | "subscriptions" | "checkout">;
  db: typeof dbAdmin;
  enqueue: typeof defaultEnqueue;
  recordBillingAudit: typeof defaultRecordBillingAudit;
  now?: () => Date;
  siteUrl?: string;
}

export function makeStartSubscription(deps: StartSubscriptionDeps) {
  const now = deps.now ?? (() => new Date());
  const siteUrl = deps.siteUrl ?? process.env.SITE_URL ?? "https://tavli.ro";

  return async function startSubscription(input: StartSubscriptionInput): Promise<{ stripeCheckoutUrl: string }> {
    const orgRows = await deps.db.select({
      id: organizations.id, name: organizations.name, legalName: organizations.legalName,
      countryCode: organizations.countryCode, taxId: organizations.taxId,
      customerType: organizations.customerType, stripeCustomerId: organizations.stripeCustomerId,
      reTrialGranted: organizations.reTrialGranted, primaryContactEmail: organizations.primaryContactEmail,
    }).from(organizations).where(eq(organizations.id, input.organizationId));
    const org = orgRows[0];
    if (!org) throw new Error(`not_found: organization ${input.organizationId}`);

    // §7.1 step 1 — trial-already-used.
    const prior = await deps.db.select({ id: subscriptions.id }).from(subscriptions)
      .where(and(eq(subscriptions.organizationId, input.organizationId), isNotNull(subscriptions.trialStartedAt)));
    if (prior[0] && !org.reTrialGranted) throw new Error(`TV1001 trial_already_used: ${input.organizationId}`);

    // §7.1 step 3 — customer_type guard.
    if (!org.customerType) throw new Error(`invalid_input: organizations.customer_type required before startSubscription`);

    // §7.1 step 5 — Stripe Customer (reuse or create).
    let stripeCustomerId = org.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await deps.stripe.customers.create({
        email: org.primaryContactEmail,
        name: org.legalName ?? org.name,
        metadata: { organization_id: org.id, customer_type: org.customerType },
        ...(org.customerType === "business" && org.taxId
          ? { tax_id_data: [{ type: org.countryCode === "RO" ? "ro_vat" : "eu_vat", value: org.taxId }] }
          : {}),
      });
      stripeCustomerId = customer.id;
      await deps.db.update(organizations).set({ stripeCustomerId }).where(eq(organizations.id, org.id));
    }

    const startedAt = now();
    const trialEnd = new Date(startedAt.getTime() + TRIAL_DAYS * DAY_MS);

    // §7.1 step 5 — Subscription.
    const sub = await deps.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [
        { price: priceIdForTierFrequency(input.tier, input.frequency) },
        ...(input.tier === "pro" ? [{ price: priceIdForExtraLocation(input.frequency), quantity: 0 }] : []),
      ],
      trial_end: Math.floor(trialEnd.getTime() / 1000),
      trial_settings: { end_behavior: { missing_payment_method: "pause" } },
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      automatic_tax: { enabled: true },
      metadata: { organization_id: org.id, tier: input.tier, frequency: input.frequency },
    });

    // §7.1 step 6 — mirror rows.
    await deps.db.transaction(async (tx) => {
      const inserted = await tx.insert(subscriptions).values({
        organizationId: org.id, stripeSubscriptionId: sub.id, stripeCustomerId,
        tier: input.tier, frequency: input.frequency, status: sub.status,
        trialStartedAt: startedAt, trialEndsAt: trialEnd,
      }).returning({ id: subscriptions.id });
      const localSubId = inserted[0].id;
      for (const item of sub.items.data) {
        const kind = item.price.id === priceIdForExtraLocation(input.frequency) ? "extra_location" : "base_tier";
        await tx.insert(subscriptionItems).values({
          subscriptionId: localSubId, stripeSubscriptionItemId: item.id, kind,
          stripePriceId: item.price.id, quantity: (item as { quantity?: number }).quantity ?? 1,
          unitAmountCents: (item.price as { unit_amount?: number }).unit_amount ?? 0,
        });
      }
    });

    // §7.1 step 7 — Checkout (setup-mode card-on-file).
    const session = await deps.stripe.checkout.sessions.create({
      mode: "setup",
      customer: stripeCustomerId,
      setup_intent_data: { metadata: { subscription_id: sub.id, organization_id: org.id } },
      success_url: `${siteUrl}/partner/onboarding?card=success`,
      cancel_url: `${siteUrl}/partner/onboarding?card=cancel`,
    });

    // §7.1 step 8 — reminders.
    const ms = (d: number) => new Date(startedAt.getTime() + d * DAY_MS);
    await deps.enqueue(JOBS.billing.sendReminderDay60, { organizationId: org.id }, { startAfter: ms(60) });
    await deps.enqueue(JOBS.billing.sendReminderDay75, { organizationId: org.id }, { startAfter: ms(75) });
    await deps.enqueue(JOBS.billing.sendReminderDay85, { organizationId: org.id }, { startAfter: ms(85) });

    // §7.1 step 9 — audit.
    await deps.recordBillingAudit({
      organizationId: org.id, eventType: "billing.subscription_created",
      context: { tier: input.tier, frequency: input.frequency, stripe_subscription_id: sub.id, stripe_customer_id: stripeCustomerId },
    });

    if (!session.url) throw new Error("internal: Stripe Checkout session returned no url");
    return { stripeCheckoutUrl: session.url };
  };
}

export const startSubscription = makeStartSubscription({
  stripe: undefined as never, // bound lazily where used (server action); see note
  db: dbAdmin,
  enqueue: defaultEnqueue,
  recordBillingAudit: defaultRecordBillingAudit,
});
```

> Note on the singleton: `getStripe()` throws without `STRIPE_SECRET_KEY`, so do NOT call it at module load. Either export only `makeStartSubscription` and have the caller (onboard seam) build the instance with `getStripe()` at call time, OR make the singleton lazy. The plan's onboard seam (Task 5) builds it lazily with `getStripe()` inside the guarded branch. Remove the `startSubscription` eager singleton if it complicates tsc — prefer exporting the factory + a lazy getter.

- [ ] **Step 4: Run → pass** (3 tests).
- [ ] **Step 5: tsc + Commit** — `feat(billing): startSubscription orchestration (§12 §7.1 Wave 5 sub-unit C.2)`.

---

## Task 3: Reminder job handlers + worker wiring

**Files:** Create `src/lib/jobs/handlers/billing.ts` + `__tests__/billing.test.ts`; Modify `scripts/worker.ts`.

- [ ] **Step 1: Failing test** — `makeTrialReminderHandler` no-ops when subscription not `trialing`; sends `TrialEndingEmail` otherwise. Inject `loadActiveSubscription` (returns `{tier,status,...}|null`), `sendEmail`, `render`-free (pass a `renderEmail` dep or import render — mock `@react-email/render`). Assert `sendEmail` called with `templateKey: 'trial_ending_day_60'` for the day-60 handler; not called when null/not-trialing.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** `src/lib/jobs/handlers/billing.ts`: `makeTrialReminderHandler({ loadActiveSubscription, loadOrgContact, sendEmail, render, day })` → resolve org email+locale; `const sub = await loadActiveSubscription(orgId); if (!sub || sub.status !== 'trialing') return;` → `const html = await render(TrialEndingEmail({ day, trialEndsAt: sub.trial_ends_at, locale }))` (+ plainText) → `sendEmail({ to, locale, templateKey: \`trial_ending_day_${day}\`, subject, html, text, context: { organization_id } })`. Export `handleTrialReminderDay60/75/85` bound to the production deps.

- [ ] **Step 4: Wire worker** — in `scripts/worker.ts`, import the 3 handlers and register (NO schedule; fired by startAfter enqueue):

```ts
  await boss.work(JOBS.billing.sendReminderDay60, async ([job]) => { await handleTrialReminderDay60(job.data as { organizationId: string }); });
  await boss.work(JOBS.billing.sendReminderDay75, async ([job]) => { await handleTrialReminderDay75(job.data as { organizationId: string }); });
  await boss.work(JOBS.billing.sendReminderDay85, async ([job]) => { await handleTrialReminderDay85(job.data as { organizationId: string }); });
```

- [ ] **Step 5: Run → pass; tsc; Commit** — `feat(billing): day-60/75/85 trial reminder jobs (§12 Wave 5 sub-unit C.3)`.

---

## Task 4: Email templates

**Files:** Create `src/emails/TrialEndingEmail.tsx`, `src/emails/RecurringChargeConsentEmail.tsx` + `src/emails/__tests__/billing-emails.test.ts`.

- [ ] **Step 1: Failing test** — render each template to html for ro/en/de without throwing; day-85 `TrialEndingEmail` html contains the charge-date line; `RecurringChargeConsentEmail` subject/heading present. Use `import { render } from "@react-email/render"`.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** both templates following `DataDeletionConfirmedEmail.tsx` (function component returning `@react-email/components` JSX; inline `COPY: { ro, en, de }`; `Locale` type). `TrialEndingEmail` props `{ day: 60|75|85; trialEndsAt: Date; chargeAmount?: string; locale }`. `RecurringChargeConsentEmail` props `{ locale; chargeDescription?: string }`, subject "Card on file at Tavli — recurring charge confirmation".

- [ ] **Step 4: Run → pass; Commit** — `feat(emails): TrialEnding + RecurringChargeConsent templates (§12 Wave 5 sub-unit C.4)`.

---

## Task 5: `/onboard` activation seam

**Files:** Modify `src/app/onboard/[token]/review/actions.ts`.

- [ ] **Step 1:** After the restaurant publishes successfully in `publishRestaurant`, add a guarded block: resolve the org for the restaurant; load `organizations.customer_type`; if non-null AND no active subscription exists, build the Stripe-bound `startSubscription` (`makeStartSubscription({ stripe: getStripe(), db: dbAdmin, enqueue, recordBillingAudit })`) and call it with `{ organizationId, tier: 'base', frequency: 'monthly' }` inside try/catch — log + continue on failure (publish must not break). If `customer_type` is null, skip silently (debug log). Do NOT import `getStripe` at module top in a way that throws; call it inside the guarded branch.

- [ ] **Step 2:** Add/extend the onboard review action test (or a focused unit test of the extracted seam helper) — startSubscription invoked when customer_type set; skipped when null; publish still returns ok when startSubscription throws. (If `publishRestaurant` is hard to unit-test due to Supabase coupling, extract the seam into `maybeStartTrial(orgId, deps)` in `src/lib/billing/onboard-trial-seam.ts` and unit-test that; call it from publishRestaurant.)

- [ ] **Step 3: tsc + full relevant tests; Commit** — `feat(billing): forward-declared trial-start seam in onboard completion (§12 Wave 5 sub-unit C.5)`.

---

## Task 6: Verification + build-order + memory

- [ ] **Step 1:** `npx tsc --noEmit` clean.
- [ ] **Step 2:** `npx jest` — new C suites pass; failing set unchanged from the 11 pre-existing DB-integration suites (no new regressions).
- [ ] **Step 3:** `npm run lint` — new errors only `no-explicit-any` in test mocks.
- [ ] **Step 4:** Annotate build-order: mark `§12 startSubscription (§7.1) + day-91 PSD2/SCA conversion (§7.3)` `[x]` with a W5-C note (startSubscription + reminders + templates + onboard seam; setup_intent/PSD2-send + status mirror in W5-D).
- [ ] **Step 5:** Memory: W5-C shipped; next W5-D (Stripe webhook router — setup_intent.succeeded sends RecurringChargeConsentEmail + two-layer idempotent status mirroring).
- [ ] **Step 6: Commit** the build-order annotation.

---

## Notes for the executor
- **No keys / no live Stripe.** All Stripe via injected client + mocks. `getStripe()` is only ever called inside the onboard guarded branch (which no-ops until customer_type capture lands), so module load never throws.
- **No migration** in W5-C (uses W5-B tables, already applied locally).
- **Webhook gap is intentional:** a W5-C-created subscription stays at its initial Stripe status until W5-D's mirror handlers ship. Build-ahead wave.
