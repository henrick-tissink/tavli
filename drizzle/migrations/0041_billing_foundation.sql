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
