# Wave 5 sub-unit B — §12 Billing Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the §12 billing data + read substrate — billing schema (4 enums + `re_trial_granted` + 5 tables + RLS), env-backed Stripe price-id resolvers, the idempotent Stripe products/prices seed + `tax_behavior` assertion (user-run), and the real `loadActiveSubscription` (§3.5) that replaces the Wave 4 base-tier stub.

**Architecture:** Migration 0041 + Drizzle mirror for the schema. `loadActiveSubscription` follows the established `make*({deps})` DI + `React.cache()` singleton pattern (mirrors `can()` / `currentUserPrimaryRestaurant`), reads the local `subscriptions` mirror only, returns `ActiveSubscriptionState | null`, never throws. The stub's 2 consumers (`photos/actions.ts`, `venue-actions.ts`) move to the real helper with a `null → base` fallback. Stripe seed + verify scripts are thin orchestration around unit-tested pure functions; the live run is user-gated (needs `STRIPE_SECRET_KEY`).

**Tech Stack:** Next.js (vendored), Drizzle ORM, Postgres + RLS, Stripe Node SDK, Jest (`@jest-environment node`, DI + mocked clients).

**Spec:** `docs/superpowers/specs/2026-05-24-wave5-B-billing-foundation-design.md`

**Out of scope:** subscription flows (W5-C startSubscription/Checkout/SetupIntent), webhook router (W5-D), billing UI (W5-E), mutations (W5-F), dunning/jobs (W5-G), marketing overage (Wave 7).

---

## File Structure

- `src/lib/db/schema.ts` — **modify**: 4 enums, `organizations.reTrialGranted`, 5 tables (`subscriptions`, `subscriptionItems`, `invoices`, `paymentMethods`, `billingAuditLog`).
- `drizzle/migrations/0041_billing_foundation.sql` — **create**.
- `drizzle/migrations/meta/_journal.json` — **modify**: append 0041.
- `src/lib/billing/price-ids.ts` + `__tests__/price-ids.test.ts` — **create**.
- `scripts/seed-stripe-prices.ts`, `scripts/verify-stripe-prices.ts` — **create** (user-run).
- `src/lib/billing/stripe-price-spec.ts` + `__tests__/stripe-price-spec.test.ts` — **create**: pure price-spec + `assertExclusiveTaxBehavior` (the tested core the scripts call).
- `package.json` — **modify**: add `verify:stripe-prices` + `seed:stripe-prices` scripts.
- `src/lib/billing/load-subscription.ts` + `__tests__/load-subscription.test.ts` — **create**.
- `src/lib/billing/subscription-stub.ts` + its test — **delete**.
- `src/app/api/photos/actions.ts` — **modify**: real helper + `?.tier`.
- `src/lib/multi-location/venue-actions.ts` — **modify**: real helper DI default + `sub?.tier ?? 'base'`.
- `src/lib/multi-location/__tests__/venue-actions.test.ts` — **modify**: fakes to `{tier:'pro'} | null` shape.
- `.env.local.example` — **modify**: document `STRIPE_PRICE_*`.

---

## Task 1: Migration 0041 + Drizzle schema

**Files:** Modify `src/lib/db/schema.ts`; Create `drizzle/migrations/0041_billing_foundation.sql`; Modify `drizzle/migrations/meta/_journal.json`.

- [ ] **Step 1: Add the 4 enums to schema.ts**

Near the other `pgEnum` declarations (after `orgCustomerType`, ~line 143):

```ts
export const subscriptionTier = pgEnum("subscription_tier", ["base", "pro"]);
export const billingFrequency = pgEnum("billing_frequency", ["monthly", "annual"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing", "active", "past_due", "cancelled", "unpaid", "incomplete",
]);
export const subscriptionItemKind = pgEnum("subscription_item_kind", [
  "base_tier", "extra_location", "sms_overage", "whatsapp_overage",
]);
```

- [ ] **Step 2: Add `reTrialGranted` to organizations**

In the `organizations` table, after `brandSecondary`:

```ts
  reTrialGranted: boolean("re_trial_granted").notNull().default(false),
```

- [ ] **Step 3: Add the 5 billing tables to schema.ts**

Append after `venueAdditionLog` (keep billing tables together):

```ts
// ─── subscriptions (§12 §4.2) ───────────────────────────────────────────
// One row per org; mirrors the Stripe Subscription. Stripe is source of
// truth; this is the read mirror (loadActiveSubscription reads it).
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 80 }).notNull().unique(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 80 }).notNull(),
  tier: subscriptionTier("tier").notNull(),
  frequency: billingFrequency("frequency").notNull().default("monthly"),
  status: subscriptionStatus("status").notNull(),
  statusSyncedAt: timestamp("status_synced_at", { withTimezone: true }).notNull().defaultNow(),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }).notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
  trialConversionBlockedAt: timestamp("trial_conversion_blocked_at", { withTimezone: true }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  cancellationRequestedByUserId: uuid("cancellation_requested_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  defaultPaymentMethodStripeId: varchar("default_payment_method_stripe_id", { length: 80 }),
  consentEmailSentAt: timestamp("consent_email_sent_at", { withTimezone: true }),
  annualPaidThrough: timestamp("annual_paid_through", { withTimezone: true }),
  pendingFrequencyChange: billingFrequency("pending_frequency_change"),
  pendingFrequencyEffectiveAt: timestamp("pending_frequency_effective_at", { withTimezone: true }),
  pendingFrequencyRequestedAt: timestamp("pending_frequency_requested_at", { withTimezone: true }),
  pendingFrequencyRequestedByUserId: uuid("pending_frequency_requested_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("subscriptions_org_active").on(t.organizationId)
    .where(sql`status in ('trialing','active','past_due','unpaid')`),
  index("subscriptions_trial_ends").on(t.trialEndsAt).where(sql`status = 'trialing'`),
  index("subscriptions_current_period_end").on(t.currentPeriodEnd).where(sql`status in ('active','past_due')`),
  index("subscriptions_stripe_id").on(t.stripeSubscriptionId),
]);

// ─── subscription_items (§12 §4.3) ──────────────────────────────────────
export const subscriptionItems = pgTable("subscription_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
  stripeSubscriptionItemId: varchar("stripe_subscription_item_id", { length: 80 }).notNull().unique(),
  kind: subscriptionItemKind("kind").notNull(),
  stripePriceId: varchar("stripe_price_id", { length: 80 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitAmountCents: integer("unit_amount_cents").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("EUR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("subscription_items_kind_unique").on(t.subscriptionId, t.kind)
    .where(sql`kind in ('base_tier','extra_location')`),
  index("subscription_items_subscription").on(t.subscriptionId),
]);

// ─── invoices (§12 §4.4) ────────────────────────────────────────────────
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  stripeInvoiceId: varchar("stripe_invoice_id", { length: 80 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull(),
  amountDueCents: integer("amount_due_cents").notNull(),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  taxAmountCents: integer("tax_amount_cents").notNull().default(0),
  currency: char("currency", { length: 3 }).notNull(),
  hostedInvoiceUrl: text("hosted_invoice_url"),
  invoicePdfUrl: text("invoice_pdf_url"),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("invoices_org").on(t.organizationId, t.createdAt.desc()),
  index("invoices_subscription").on(t.subscriptionId, t.createdAt.desc()),
  index("invoices_status").on(t.status),
]);

// ─── payment_methods (§12 §4.5) ─────────────────────────────────────────
export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  stripePaymentMethodId: varchar("stripe_payment_method_id", { length: 80 }).notNull().unique(),
  type: varchar("type", { length: 20 }).notNull(),
  cardBrand: varchar("card_brand", { length: 20 }),
  cardLast4: varchar("card_last4", { length: 4 }),
  cardExpMonth: smallint("card_exp_month"),
  cardExpYear: smallint("card_exp_year"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  detachedAt: timestamp("detached_at", { withTimezone: true }),
}, (t) => [
  index("payment_methods_org").on(t.organizationId).where(sql`detached_at is null`),
]);

// ─── billing_audit_log (§12 §4.6) ───────────────────────────────────────
// Two-column org id: organization_id (FK, set-null on org delete, survives
// 7-yr fiscal retention) + organization_id_at_event (immutable snapshot for
// ANPC/forensic queries). Service-role inserts; created here, written by W5-C+.
export const billingAuditLog = pgTable("billing_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  organizationIdAtEvent: uuid("organization_id_at_event").notNull(),
  eventType: varchar("event_type", { length: 60 }).notNull(),
  actorUserId: uuid("actor_user_id").references(() => authUsers.id, { onDelete: "set null" }),
  context: jsonb("context").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("billing_audit_log_org").on(t.organizationId, t.occurredAt.desc()),
  index("billing_audit_log_type").on(t.eventType, t.occurredAt.desc()),
]);
```

- [ ] **Step 4: Write the migration SQL**

Create `drizzle/migrations/0041_billing_foundation.sql` (note in header: the
§4.1a `chk_active_org_has_customer_type` cross-table invariant is
application-enforced in W5-C `startSubscription`, not a DB trigger, per
foundations §4.3):

```sql
-- §12 — Billing foundation (Wave 5 sub-unit B).
-- 4 enums + organizations.re_trial_granted + 5 tables + indexes + RLS.
-- NOTE: §4.1a "no active subscription for an org with NULL customer_type" is a
-- cross-table invariant; enforced in the W5-C startSubscription action (not a
-- DB trigger, per foundations §4.3 no-new-triggers).

CREATE TYPE "subscription_tier" AS ENUM ('base', 'pro');
CREATE TYPE "billing_frequency" AS ENUM ('monthly', 'annual');
CREATE TYPE "subscription_status" AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'unpaid', 'incomplete');
CREATE TYPE "subscription_item_kind" AS ENUM ('base_tier', 'extra_location', 'sms_overage', 'whatsapp_overage');

ALTER TABLE "organizations" ADD COLUMN "re_trial_granted" boolean NOT NULL DEFAULT false;

CREATE TABLE "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "stripe_subscription_id" varchar(80) NOT NULL UNIQUE,
  "stripe_customer_id" varchar(80) NOT NULL,
  "tier" subscription_tier NOT NULL,
  "frequency" billing_frequency NOT NULL DEFAULT 'monthly',
  "status" subscription_status NOT NULL,
  "status_synced_at" timestamptz NOT NULL DEFAULT now(),
  "trial_started_at" timestamptz NOT NULL,
  "trial_ends_at" timestamptz NOT NULL,
  "trial_conversion_blocked_at" timestamptz,
  "current_period_start" timestamptz,
  "current_period_end" timestamptz,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "cancelled_at" timestamptz,
  "cancellation_reason" text,
  "cancellation_requested_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "default_payment_method_stripe_id" varchar(80),
  "consent_email_sent_at" timestamptz,
  "annual_paid_through" timestamptz,
  "pending_frequency_change" billing_frequency,
  "pending_frequency_effective_at" timestamptz,
  "pending_frequency_requested_at" timestamptz,
  "pending_frequency_requested_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "subscriptions_org_active" ON "subscriptions" ("organization_id")
  WHERE "status" IN ('trialing','active','past_due','unpaid');
CREATE INDEX "subscriptions_trial_ends" ON "subscriptions" ("trial_ends_at") WHERE "status" = 'trialing';
CREATE INDEX "subscriptions_current_period_end" ON "subscriptions" ("current_period_end") WHERE "status" IN ('active','past_due');
CREATE INDEX "subscriptions_stripe_id" ON "subscriptions" ("stripe_subscription_id");

CREATE TABLE "subscription_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "subscription_id" uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  "stripe_subscription_item_id" varchar(80) NOT NULL UNIQUE,
  "kind" subscription_item_kind NOT NULL,
  "stripe_price_id" varchar(80) NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "unit_amount_cents" integer NOT NULL,
  "currency" char(3) NOT NULL DEFAULT 'EUR',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "subscription_items_kind_unique" ON "subscription_items" ("subscription_id", "kind")
  WHERE "kind" IN ('base_tier','extra_location');
CREATE INDEX "subscription_items_subscription" ON "subscription_items" ("subscription_id");

CREATE TABLE "invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "subscription_id" uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  "stripe_invoice_id" varchar(80) NOT NULL UNIQUE,
  "status" varchar(20) NOT NULL,
  "amount_due_cents" integer NOT NULL,
  "amount_paid_cents" integer NOT NULL DEFAULT 0,
  "tax_amount_cents" integer NOT NULL DEFAULT 0,
  "currency" char(3) NOT NULL,
  "hosted_invoice_url" text,
  "invoice_pdf_url" text,
  "period_start" timestamptz,
  "period_end" timestamptz,
  "paid_at" timestamptz,
  "voided_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "invoices_org" ON "invoices" ("organization_id", "created_at" DESC);
CREATE INDEX "invoices_subscription" ON "invoices" ("subscription_id", "created_at" DESC);
CREATE INDEX "invoices_status" ON "invoices" ("status");

CREATE TABLE "payment_methods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "stripe_payment_method_id" varchar(80) NOT NULL UNIQUE,
  "type" varchar(20) NOT NULL,
  "card_brand" varchar(20),
  "card_last4" varchar(4),
  "card_exp_month" smallint,
  "card_exp_year" smallint,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "detached_at" timestamptz
);
CREATE INDEX "payment_methods_org" ON "payment_methods" ("organization_id") WHERE "detached_at" IS NULL;

CREATE TABLE "billing_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid REFERENCES organizations(id) ON DELETE SET NULL,
  "organization_id_at_event" uuid NOT NULL,
  "event_type" varchar(60) NOT NULL,
  "actor_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "context" jsonb NOT NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "billing_audit_log_org" ON "billing_audit_log" ("organization_id", "occurred_at" DESC);
CREATE INDEX "billing_audit_log_type" ON "billing_audit_log" ("event_type", "occurred_at" DESC);

-- RLS: org-admin SELECT; service-role mutations (no write policies).
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_admin_select" ON "subscriptions" FOR SELECT USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members"
    WHERE "user_id" = auth.uid() AND "is_active" = true AND "role" IN ('owner','admin')));

ALTER TABLE "subscription_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscription_items_admin_select" ON "subscription_items" FOR SELECT USING (
  "subscription_id" IN (SELECT s."id" FROM "subscriptions" s
    JOIN "organization_members" m ON m."organization_id" = s."organization_id"
    WHERE m."user_id" = auth.uid() AND m."is_active" = true AND m."role" IN ('owner','admin')));

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_admin_select" ON "invoices" FOR SELECT USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members"
    WHERE "user_id" = auth.uid() AND "is_active" = true AND "role" IN ('owner','admin')));

ALTER TABLE "payment_methods" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_methods_admin_select" ON "payment_methods" FOR SELECT USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members"
    WHERE "user_id" = auth.uid() AND "is_active" = true AND "role" IN ('owner','admin')));

ALTER TABLE "billing_audit_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing_audit_log_admin_select" ON "billing_audit_log" FOR SELECT USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members"
    WHERE "user_id" = auth.uid() AND "is_active" = true AND "role" IN ('owner','admin')));
```

- [ ] **Step 5: Append the journal entry**

Append to `drizzle/migrations/meta/_journal.json` `entries`: `idx`=last+1 (41),
same `version` string, `when`=`Date.now()`, `tag`=`"0041_billing_foundation"`,
`breakpoints`=`true`.

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
Run: `npx jest src/lib/jobs/__tests__/bootstrap.test.ts` → PASS (sanity).

```bash
git add src/lib/db/schema.ts drizzle/migrations/0041_billing_foundation.sql drizzle/migrations/meta/_journal.json
git commit -m "feat(billing): §12 billing schema + migration 0041 (§12 Wave 5 sub-unit B.1)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Price-id resolvers

**Files:** Create `src/lib/billing/price-ids.ts` + `__tests__/price-ids.test.ts`; Modify `.env.local.example`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/billing/__tests__/price-ids.test.ts`:

```ts
/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));

import { priceIdForTierFrequency, priceIdForExtraLocation, priceIdForOverage } from "../price-ids";

const ENV_BACKUP = { ...process.env };
afterEach(() => { process.env = { ...ENV_BACKUP }; });

describe("price-id resolvers", () => {
  it("resolves (tier, frequency) from env", () => {
    process.env.STRIPE_PRICE_PRO_ANNUAL = "price_pro_annual_live";
    expect(priceIdForTierFrequency("pro", "annual")).toBe("price_pro_annual_live");
  });

  it("resolves extra-location price from env", () => {
    process.env.STRIPE_PRICE_EXTRA_LOCATION_MONTHLY = "price_extra_m";
    expect(priceIdForExtraLocation("monthly")).toBe("price_extra_m");
  });

  it("resolves overage price from env", () => {
    process.env.STRIPE_PRICE_SMS_OVERAGE = "price_sms";
    expect(priceIdForOverage("sms_overage")).toBe("price_sms");
  });

  it("throws a clear error when the env var is unset", () => {
    delete process.env.STRIPE_PRICE_BASE_MONTHLY;
    expect(() => priceIdForTierFrequency("base", "monthly")).toThrow(/STRIPE_PRICE_BASE_MONTHLY/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/billing/__tests__/price-ids.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write the implementation**

Create `src/lib/billing/price-ids.ts`:

```ts
import "server-only";

type Tier = "base" | "pro";
type Frequency = "monthly" | "annual";
type OverageKind = "sms_overage" | "whatsapp_overage";

function readPriceEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} missing. Run \`npm run seed:stripe-prices\` and set the printed ` +
        `STRIPE_PRICE_* values in your environment (§12 §5/§8.1).`,
    );
  }
  return value;
}

const TIER_FREQ_ENV: Record<Tier, Record<Frequency, string>> = {
  base: { monthly: "STRIPE_PRICE_BASE_MONTHLY", annual: "STRIPE_PRICE_BASE_ANNUAL" },
  pro: { monthly: "STRIPE_PRICE_PRO_MONTHLY", annual: "STRIPE_PRICE_PRO_ANNUAL" },
};

const EXTRA_LOCATION_ENV: Record<Frequency, string> = {
  monthly: "STRIPE_PRICE_EXTRA_LOCATION_MONTHLY",
  annual: "STRIPE_PRICE_EXTRA_LOCATION_ANNUAL",
};

const OVERAGE_ENV: Record<OverageKind, string> = {
  sms_overage: "STRIPE_PRICE_SMS_OVERAGE",
  whatsapp_overage: "STRIPE_PRICE_WHATSAPP_OVERAGE",
};

export function priceIdForTierFrequency(tier: Tier, frequency: Frequency): string {
  return readPriceEnv(TIER_FREQ_ENV[tier][frequency]);
}
export function priceIdForExtraLocation(frequency: Frequency): string {
  return readPriceEnv(EXTRA_LOCATION_ENV[frequency]);
}
export function priceIdForOverage(kind: OverageKind): string {
  return readPriceEnv(OVERAGE_ENV[kind]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/billing/__tests__/price-ids.test.ts` → PASS (4 tests).

- [ ] **Step 5: Document envs**

Append to `.env.local.example` a `# §12 Stripe prices (set after running npm run seed:stripe-prices)` block listing all 8 `STRIPE_PRICE_*` vars with empty values.

- [ ] **Step 6: Commit**

```bash
git add src/lib/billing/price-ids.ts src/lib/billing/__tests__/price-ids.test.ts .env.local.example
git commit -m "feat(billing): env-backed Stripe price-id resolvers (§12 Wave 5 sub-unit B.2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Stripe price spec + seed + verify (user-run)

**Files:** Create `src/lib/billing/stripe-price-spec.ts` + `__tests__/stripe-price-spec.test.ts`; Create `scripts/seed-stripe-prices.ts`, `scripts/verify-stripe-prices.ts`; Modify `package.json`.

- [ ] **Step 1: Write the failing test (the pure tested core)**

Create `src/lib/billing/__tests__/stripe-price-spec.test.ts`:

```ts
/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));

import { TAVLI_PRICE_SPECS, assertExclusiveTaxBehavior } from "../stripe-price-spec";

describe("TAVLI_PRICE_SPECS", () => {
  it("declares all 8 prices, all EUR, all tax_behavior 'exclusive'", () => {
    expect(TAVLI_PRICE_SPECS).toHaveLength(8);
    for (const p of TAVLI_PRICE_SPECS) {
      expect(p.currency).toBe("eur");
      expect(p.tax_behavior).toBe("exclusive");
      expect(p.unit_amount).toBeGreaterThan(0);
    }
  });

  it("annual prices are 10x the monthly counterpart (2 months free)", () => {
    const baseM = TAVLI_PRICE_SPECS.find((p) => p.key === "base_monthly")!;
    const baseA = TAVLI_PRICE_SPECS.find((p) => p.key === "base_annual")!;
    expect(baseA.unit_amount).toBe(baseM.unit_amount * 10);
  });
});

describe("assertExclusiveTaxBehavior", () => {
  it("passes when every fetched price is exclusive", () => {
    expect(() =>
      assertExclusiveTaxBehavior([
        { id: "price_1", tax_behavior: "exclusive" },
        { id: "price_2", tax_behavior: "exclusive" },
      ]),
    ).not.toThrow();
  });

  it("throws naming the offending price when any is not exclusive", () => {
    expect(() =>
      assertExclusiveTaxBehavior([
        { id: "price_1", tax_behavior: "exclusive" },
        { id: "price_bad", tax_behavior: "inclusive" },
      ]),
    ).toThrow(/price_bad/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/billing/__tests__/stripe-price-spec.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write the implementation**

Create `src/lib/billing/stripe-price-spec.ts`:

```ts
import "server-only";

/**
 * Canonical Tavli Stripe price catalogue (§12 §5). Source of truth for the
 * seed script. All prices are EUR with tax_behavior 'exclusive' (TVA on top,
 * §3.6.3). Annual = 10x monthly (2 months free, §1/§2).
 */
export interface TavliPriceSpec {
  key: string;            // stable lookup key (also Stripe price lookup_key)
  product: string;        // stable product metadata key
  productName: string;
  unit_amount: number;    // cents
  currency: "eur";
  interval: "month" | "year";
  tax_behavior: "exclusive";
}

export const TAVLI_PRICE_SPECS: TavliPriceSpec[] = [
  { key: "base_monthly", product: "tavli_base", productName: "Tavli (Base)", unit_amount: 3000, currency: "eur", interval: "month", tax_behavior: "exclusive" },
  { key: "base_annual", product: "tavli_base", productName: "Tavli (Base)", unit_amount: 30000, currency: "eur", interval: "year", tax_behavior: "exclusive" },
  { key: "pro_monthly", product: "tavli_pro", productName: "Tavli Pro", unit_amount: 6000, currency: "eur", interval: "month", tax_behavior: "exclusive" },
  { key: "pro_annual", product: "tavli_pro", productName: "Tavli Pro", unit_amount: 60000, currency: "eur", interval: "year", tax_behavior: "exclusive" },
  { key: "extra_location_monthly", product: "tavli_extra_location", productName: "Extra location", unit_amount: 1500, currency: "eur", interval: "month", tax_behavior: "exclusive" },
  { key: "extra_location_annual", product: "tavli_extra_location", productName: "Extra location", unit_amount: 15000, currency: "eur", interval: "year", tax_behavior: "exclusive" },
  { key: "sms_overage", product: "tavli_sms_overage", productName: "SMS overage", unit_amount: 6, currency: "eur", interval: "month", tax_behavior: "exclusive" },
  { key: "whatsapp_overage", product: "tavli_whatsapp_overage", productName: "WhatsApp overage", unit_amount: 3, currency: "eur", interval: "month", tax_behavior: "exclusive" },
];

export interface FetchedPrice {
  id: string;
  tax_behavior: string | null;
}

/** §3.6.3 / §16 step 3a: every Tavli price MUST be tax_behavior 'exclusive'. */
export function assertExclusiveTaxBehavior(prices: FetchedPrice[]): void {
  const bad = prices.filter((p) => p.tax_behavior !== "exclusive");
  if (bad.length > 0) {
    throw new Error(
      `tax_behavior assertion failed (§12 §3.6.3): ${bad
        .map((p) => `${p.id}=${p.tax_behavior}`)
        .join(", ")} — every Tavli price must be 'exclusive'.`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/billing/__tests__/stripe-price-spec.test.ts` → PASS (4 tests).

- [ ] **Step 5: Write the seed + verify scripts (user-run, thin orchestration)**

Create `scripts/seed-stripe-prices.ts`: imports `getStripe()` + `TAVLI_PRICE_SPECS`; for each spec, idempotently ensure the product exists (search by `metadata.tavli_product = spec.product`, create if absent) then ensure the price exists (search by `lookup_key = spec.key`, create with `tax_behavior:'exclusive'`, `currency`, `unit_amount`, `recurring:{interval}`, `lookup_key` if absent); print a table of `STRIPE_PRICE_*` env name → created price id for the operator to copy. Guard: refuse to run without `STRIPE_SECRET_KEY` (getStripe already throws). Top-of-file comment: "USER-run; needs STRIPE_SECRET_KEY; not executed by Claude/CI."

Create `scripts/verify-stripe-prices.ts`: imports `getStripe()` + the 8 `STRIPE_PRICE_*` envs + `assertExclusiveTaxBehavior`; fetches each price via `stripe.prices.retrieve(id)`, maps to `{id, tax_behavior}`, calls `assertExclusiveTaxBehavior`; `process.exit(1)` on throw (logs the message), exit 0 on success.

- [ ] **Step 6: Add npm scripts**

In `package.json` `scripts`, add:

```json
    "seed:stripe-prices": "tsx scripts/seed-stripe-prices.ts",
    "verify:stripe-prices": "tsx scripts/verify-stripe-prices.ts",
```

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/billing/stripe-price-spec.ts src/lib/billing/__tests__/stripe-price-spec.test.ts scripts/seed-stripe-prices.ts scripts/verify-stripe-prices.ts package.json
git commit -m "feat(billing): Stripe price spec + seed/verify scripts + tax_behavior assertion (§12 Wave 5 sub-unit B.3)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `loadActiveSubscription`

**Files:** Create `src/lib/billing/load-subscription.ts` + `__tests__/load-subscription.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/billing/__tests__/load-subscription.test.ts`:

```ts
/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ subscriptions: {}, subscriptionItems: {}, organizations: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn(), and: jest.fn(), inArray: jest.fn() }));

import { makeLoadActiveSubscription } from "../load-subscription";

const ACTIVE_ROW = {
  id: "sub-1", stripeSubscriptionId: "stripe_sub_1", tier: "pro", status: "active",
  frequency: "monthly", trialEndsAt: null, currentPeriodEnd: new Date("2026-07-01"),
  pendingFrequencyChange: null, stripeCustomerId: "cus_1",
};
const ITEM_ROW = { id: "item-1", stripeSubscriptionItemId: "si_1", kind: "base_tier", quantity: 1 };

function makeDb(opts: { subRows?: any[]; itemRows?: any[]; throwOnSelect?: boolean }) {
  let call = 0;
  return {
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => {
          if (opts.throwOnSelect) return Promise.reject(new Error("db down"));
          call += 1;
          return Promise.resolve(call === 1 ? (opts.subRows ?? []) : (opts.itemRows ?? []));
        }),
      }),
    })),
  };
}

describe("loadActiveSubscription", () => {
  it("maps an active subscription + its items", async () => {
    const load = makeLoadActiveSubscription({ db: makeDb({ subRows: [ACTIVE_ROW], itemRows: [ITEM_ROW] }) as any });
    const result = await load("org-1");
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("pro");
    expect(result!.stripeSubscriptionId).toBe("stripe_sub_1");
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0].kind).toBe("base_tier");
  });

  it("returns null when the org has no subscription row", async () => {
    const load = makeLoadActiveSubscription({ db: makeDb({ subRows: [] }) as any });
    expect(await load("org-1")).toBeNull();
  });

  it("returns null (no throw) when the read fails", async () => {
    const load = makeLoadActiveSubscription({ db: makeDb({ throwOnSelect: true }) as any });
    await expect(load("org-1")).resolves.toBeNull();
  });

  it("returns null when stripe_customer_id is null (orphan guard)", async () => {
    const orphan = { ...ACTIVE_ROW, stripeCustomerId: null };
    const load = makeLoadActiveSubscription({ db: makeDb({ subRows: [orphan] }) as any });
    expect(await load("org-1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/billing/__tests__/load-subscription.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write the implementation**

Create `src/lib/billing/load-subscription.ts`:

```ts
import "server-only";
import { cache } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { subscriptions, subscriptionItems } from "@/lib/db/schema";

type SubscriptionStatus = "trialing" | "active" | "past_due" | "cancelled" | "unpaid" | "incomplete";
type BillingFrequency = "monthly" | "annual";
type SubscriptionItemKind = "base_tier" | "extra_location" | "sms_overage" | "whatsapp_overage";

const ACTIVE_STATUSES: SubscriptionStatus[] = ["trialing", "active", "past_due", "unpaid"];

export interface ActiveSubscriptionState {
  subscriptionId: string;
  stripeSubscriptionId: string;
  tier: "base" | "pro";
  status: SubscriptionStatus;
  frequency: BillingFrequency;
  trial_ends_at: Date | null;
  current_period_end: Date | null;
  pending_frequency_change: BillingFrequency | null;
  items: Array<{ id: string; stripeSubscriptionItemId: string; kind: SubscriptionItemKind; quantity: number }>;
}

export interface LoadSubscriptionDeps {
  db: Pick<typeof dbAdmin, "select">;
}

/**
 * §12 §3.5 — canonical tier/status read. Reads the local subscriptions mirror
 * only (never Stripe). Returns null for: no active row, orphan row with null
 * stripe_customer_id, or a read error (logged, NOT thrown). Callers treat null
 * as "no active paid subscription" (free-tier fallback).
 */
export function makeLoadActiveSubscription(deps: LoadSubscriptionDeps) {
  return async function loadActiveSubscription(
    organizationId: string,
  ): Promise<ActiveSubscriptionState | null> {
    try {
      const subRows = await deps.db
        .select({
          id: subscriptions.id,
          stripeSubscriptionId: subscriptions.stripeSubscriptionId,
          stripeCustomerId: subscriptions.stripeCustomerId,
          tier: subscriptions.tier,
          status: subscriptions.status,
          frequency: subscriptions.frequency,
          trialEndsAt: subscriptions.trialEndsAt,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
          pendingFrequencyChange: subscriptions.pendingFrequencyChange,
        })
        .from(subscriptions)
        .where(and(eq(subscriptions.organizationId, organizationId), inArray(subscriptions.status, ACTIVE_STATUSES)));

      const sub = subRows[0];
      if (!sub) return null;
      if (!sub.stripeCustomerId) return null; // orphan guard (§3.5 case 2)

      const itemRows = await deps.db
        .select({
          id: subscriptionItems.id,
          stripeSubscriptionItemId: subscriptionItems.stripeSubscriptionItemId,
          kind: subscriptionItems.kind,
          quantity: subscriptionItems.quantity,
        })
        .from(subscriptionItems)
        .where(eq(subscriptionItems.subscriptionId, sub.id));

      return {
        subscriptionId: sub.id,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        tier: sub.tier as "base" | "pro",
        status: sub.status as SubscriptionStatus,
        frequency: sub.frequency as BillingFrequency,
        trial_ends_at: sub.trialEndsAt,
        current_period_end: sub.currentPeriodEnd,
        pending_frequency_change: sub.pendingFrequencyChange as BillingFrequency | null,
        items: itemRows.map((i) => ({
          id: i.id,
          stripeSubscriptionItemId: i.stripeSubscriptionItemId,
          kind: i.kind as SubscriptionItemKind,
          quantity: i.quantity,
        })),
      };
    } catch (err) {
      // §3.5 case 3: never block a read path on a billing read.
      console.warn(`[billing] loadActiveSubscription read failed org=${organizationId}`, err);
      return null;
    }
  };
}

// Per-request memoization (§3.5) — same pattern as can(). One Postgres hit per
// org per request; failures are not retried within the request.
export const loadActiveSubscription = cache(makeLoadActiveSubscription({ db: dbAdmin }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/billing/__tests__/load-subscription.test.ts` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/load-subscription.ts src/lib/billing/__tests__/load-subscription.test.ts
git commit -m "feat(billing): real loadActiveSubscription helper with cache() memoization (§12 Wave 5 sub-unit B.4)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Stub transition (delete stub, migrate 2 consumers)

**Files:** Delete `src/lib/billing/subscription-stub.ts` + its test; Modify `src/app/api/photos/actions.ts`, `src/lib/multi-location/venue-actions.ts`, `src/lib/multi-location/__tests__/venue-actions.test.ts`.

- [ ] **Step 1: Update venue-actions.ts to the real helper**

In `src/lib/multi-location/venue-actions.ts`:
- Change the import `import { loadActiveSubscription as stubLoadActiveSubscription } from "@/lib/billing/subscription-stub";` → `import { loadActiveSubscription } from "@/lib/billing/load-subscription";`.
- Change the `VenueActionsDeps.loadActiveSubscription` type to `(orgId: string) => Promise<{ tier: "base" | "pro" } | null>`.
- In `addVenueToOrg` and `reactivateVenue`, change the gate from
  `const sub = await deps.loadActiveSubscription(...); if (sub.tier === "base")` to
  `const sub = await deps.loadActiveSubscription(...); if ((sub?.tier ?? "base") === "base")`.
- In the exported `venueActions` singleton, set `loadActiveSubscription` to the imported real helper.

- [ ] **Step 2: Update venue-actions tests for the null shape**

In `src/lib/multi-location/__tests__/venue-actions.test.ts`:
- The default `deps.loadActiveSubscription` still returns `{ tier: "pro" }` (valid under the new `{tier} | null` type) — happy paths unchanged.
- The existing "base tier" rejection tests still pass (`{tier:"base"}` → TV701).
- ADD one test per gated action: `loadActiveSubscription` returns `null` → rejects with `/TV701/` (no-subscription org treated as base):

```ts
  it("rejects with TV701 when the org has no active subscription (null)", async () => {
    const d = deps({ deps: { loadActiveSubscription: jest.fn().mockResolvedValue(null) } });
    const actions = makeVenueActions(d);
    await expect(actions.addVenueToOrg(ADD_INPUT)).rejects.toThrow(/TV701/);
  });
```

- [ ] **Step 3: Run venue-actions tests**

Run: `npx jest src/lib/multi-location/__tests__/venue-actions.test.ts` → PASS (11 tests).

- [ ] **Step 4: Update photos/actions.ts**

In `src/app/api/photos/actions.ts`:
- Change import `from "@/lib/billing/subscription-stub"` → `from "@/lib/billing/load-subscription"`.
- Change `const isProActive = subscription.tier === "pro";` → `const isProActive = subscription?.tier === "pro";`.

- [ ] **Step 5: Delete the stub + its test**

```bash
git rm src/lib/billing/subscription-stub.ts
git rm src/lib/billing/__tests__/subscription-stub.test.ts   # if it exists; else skip
```

(If there's no stub test file, just `rm` the stub.)

- [ ] **Step 6: Typecheck + full relevant tests + commit**

Run: `npx tsc --noEmit` → clean (no remaining importers of subscription-stub).
Run: `grep -rn "subscription-stub" src/` → no results.
Run: `npx jest src/lib/multi-location src/lib/billing` → PASS.

```bash
git add -A
git commit -m "refactor(billing): replace subscription-stub with real loadActiveSubscription (§12 Wave 5 sub-unit B.5)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Verification + build-order annotation + memory

**Files:** Modify `docs/superpowers/architecture/build-order.md`, memory.

- [ ] **Step 1: Full typecheck** — `npx tsc --noEmit` → clean.

- [ ] **Step 2: Full test suite** — `npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"`. Expected: the same 11 pre-existing DB-integration suites still fail (stale local DB — see MEMORY); ALL new billing suites + the updated venue-actions suite pass; no NEW regressions beyond the documented baseline. Confirm the failing-suite list is unchanged from the W5-A baseline.

- [ ] **Step 3: Lint** — `npm run lint 2>&1 | tail -5`. New errors only `@typescript-eslint/no-explicit-any` in test mocks (accepted baseline category).

- [ ] **Step 4: Annotate build-order** — mark the 3 §12-foundation Wave 5 lines `[x]` (subscriptions+items+invoices+payment_methods+billing_audit_log; Stripe products+prices seed + tax_behavior assertion; loadActiveSubscription) with `*(shipped 2026-05-24 — Wave 5 sub-unit B; migration 0041; stub replaced; seed/verify scripts user-run)*`.

- [ ] **Step 5: Update memory** — MEMORY.md pointer: W5-B shipped (migration 0041 + loadActiveSubscription + Stripe seed scaffolding); next W5-C (startSubscription wired into /onboard completion). Note USER actions: run `npm run seed:stripe-prices` with STRIPE_SECRET_KEY then set STRIPE_PRICE_* envs; apply migration 0041 to prod (queues behind 0033-0040).

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/architecture/build-order.md
git commit -m "docs(build-order): annotate §12 Wave 5 sub-unit B shipped (billing foundation)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Notes for the executor

- **No prod/local DB apply by Claude.** 0041 ships as a file; prod queues behind the pending 0033–0040 batch (user-triggered). The local test DB is stale (missing `restaurants.organization_id`; see MEMORY) — do NOT attempt `drizzle-kit migrate` (it stalls). All new tests use mocked `db`, so they pass without a live DB.
- **Stripe seed/verify are user-run** — need `STRIPE_SECRET_KEY`. Claude ships + unit-tests the pure core (`stripe-price-spec.ts`); the scripts are thin orchestration. Do not execute them.
- **Stub transition is behavior-preserving today:** `loadActiveSubscription` returns `null` for every org until W5-C creates subscription rows, so every org reads as free/base — identical to the old stub's `{tier:'base'}`.
- **`char` import:** `subscription_items.currency` + `invoices.currency` use `char(3)`; `char` is already imported in `schema.ts` (verify).
