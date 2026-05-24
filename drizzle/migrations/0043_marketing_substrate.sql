-- §11 — Marketing suite substrate (Wave 7 sub-unit A).
-- 6 enums + 8 new tables + ALTERs to 4 existing tables + cross FKs + RLS.
-- Consent: extends the EXISTING marketing_consents (single canonical table) —
-- no customer_consents. Suppressions: extends the EXISTING marketing_suppressions.

-- ── enums ────────────────────────────────────────────────────────────────
CREATE TYPE "marketing_channel" AS ENUM ('email', 'sms', 'whatsapp', 'in_confirmation');
CREATE TYPE "marketing_campaign_kind" AS ENUM ('triggered', 'one_off');
CREATE TYPE "marketing_campaign_status" AS ENUM ('draft','active','paused','archived','scheduled','sending','sent','cancelled');
CREATE TYPE "marketing_send_status" AS ENUM ('queued','sent','delivered','bounced','complained','failed','skipped_cap','skipped_suppressed','skipped_quiet_hours','skipped_quota','unsubscribed','opened','clicked');
CREATE TYPE "consent_source" AS ENUM ('booking_flow','qr_tent','venue_page','walk_in_manual','csv_import','review_flow','admin');
CREATE TYPE "segment_combinator" AS ENUM ('and', 'or');

-- ── ALTER existing tables ─────────────────────────────────────────────────
ALTER TABLE "marketing_consents"
  ADD COLUMN "source_surface_url" text,
  ADD COLUMN "source_ip" inet,
  ADD COLUMN "consent_copy_shown" text,
  ADD COLUMN "consent_locale" char(2);
ALTER TABLE "marketing_consents" DROP CONSTRAINT IF EXISTS "marketing_consents_channel_valid";
ALTER TABLE "marketing_consents" ADD CONSTRAINT "marketing_consents_channel_valid"
  CHECK ("channel" IN ('email_marketing','sms_marketing','whatsapp_marketing','sms_transactional','email_transactional'));

ALTER TABLE "marketing_suppressions"
  ADD COLUMN "unsuppressed_at" timestamptz,
  ADD COLUMN "source_send_id" uuid;
ALTER TABLE "marketing_suppressions" DROP CONSTRAINT IF EXISTS "marketing_suppressions_channel_valid";
ALTER TABLE "marketing_suppressions" ADD CONSTRAINT "marketing_suppressions_channel_valid"
  CHECK ("channel" IN ('email','sms','whatsapp'));

ALTER TABLE "reservations" ADD COLUMN "campaign_id" uuid;
ALTER TABLE "organizations" ADD COLUMN "marketing_frequency_cap_per_month" integer NOT NULL DEFAULT 4;

-- ── new tables ─────────────────────────────────────────────────────────────
CREATE TABLE "restaurant_marketing_settings" (
  "restaurant_id" uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  "email_sender_name" varchar(120),
  "email_reply_to" varchar(255),
  "sms_enabled" boolean NOT NULL DEFAULT false,
  "sms_sender_id" varchar(20),
  "sms_stop_shortcode" varchar(20),
  "whatsapp_enabled" boolean NOT NULL DEFAULT false,
  "whatsapp_business_account_id" varchar(80),
  "whatsapp_phone_number_id" varchar(80),
  "confirmation_promo_enabled" boolean NOT NULL DEFAULT true,
  "quiet_hours_start_local" time NOT NULL DEFAULT '21:00',
  "quiet_hours_end_local" time NOT NULL DEFAULT '10:00',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "marketing_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "restaurant_id" uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  "kind" marketing_campaign_kind NOT NULL,
  "triggered_campaign_key" varchar(40),
  "name" varchar(200) NOT NULL,
  "description" text,
  "status" marketing_campaign_status NOT NULL DEFAULT 'draft',
  "channel" marketing_channel NOT NULL,
  "subject_template" jsonb NOT NULL,
  "body_template" jsonb NOT NULL,
  "preview_text" jsonb,
  "whatsapp_template_namespace" varchar(80),
  "whatsapp_template_name" varchar(80),
  "trigger_offset_seconds" integer,
  "trigger_event" varchar(40),
  "scheduled_send_at" timestamptz,
  "send_in_restaurant_tz" boolean NOT NULL DEFAULT true,
  "segment_id" uuid,
  "recipient_count_estimate" integer,
  "tokens_used" text[] NOT NULL DEFAULT '{}'::text[],
  "created_by_user_id" uuid REFERENCES auth.users(id),
  "last_edited_by_user_id" uuid REFERENCES auth.users(id),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "sent_at" timestamptz,
  "archived_at" timestamptz
);
CREATE INDEX "marketing_campaigns_org_status" ON "marketing_campaigns" ("organization_id", "status");
CREATE INDEX "marketing_campaigns_scheduled" ON "marketing_campaigns" ("scheduled_send_at") WHERE "status" = 'scheduled';

CREATE TABLE "marketing_campaign_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  "version_number" integer NOT NULL,
  "subject_template" jsonb NOT NULL,
  "body_template" jsonb NOT NULL,
  "preview_text" jsonb,
  "edited_by_user_id" uuid REFERENCES auth.users(id),
  "edited_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("campaign_id", "version_number")
);

CREATE TABLE "marketing_segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "restaurant_id" uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "description" text,
  "filter_dsl" jsonb NOT NULL,
  "combinator" segment_combinator NOT NULL DEFAULT 'and',
  "is_snapshot" boolean NOT NULL DEFAULT false,
  "snapshot_diner_ids" uuid[],
  "estimated_size" integer,
  "last_estimated_at" timestamptz,
  "created_by_user_id" uuid REFERENCES auth.users(id),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "marketing_segments_org" ON "marketing_segments" ("organization_id");

CREATE TABLE "marketing_sends" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_id" uuid NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  "campaign_version_id" uuid REFERENCES marketing_campaign_versions(id) ON DELETE SET NULL,
  "diner_id" uuid REFERENCES diners(id) ON DELETE SET NULL,
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "restaurant_id" uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  "channel" marketing_channel NOT NULL,
  "locale" char(2) NOT NULL,
  "email" varchar(255),
  "phone" varchar(20),
  "status" marketing_send_status NOT NULL DEFAULT 'queued',
  "status_updated_at" timestamptz,
  "scheduled_send_at" timestamptz,
  "sent_at" timestamptz,
  "delivered_at" timestamptz,
  "opened_at" timestamptz,
  "first_clicked_at" timestamptz,
  "click_count" integer NOT NULL DEFAULT 0,
  "unsubscribed_at" timestamptz,
  "bounced_at" timestamptz,
  "complained_at" timestamptz,
  "resend_message_id" varchar(80),
  "twilio_message_sid" varchar(80),
  "failure_code" varchar(60),
  "failure_message" text,
  "attributed_reservation_id" uuid REFERENCES reservations(id) ON DELETE SET NULL,
  "attribution_window_expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "marketing_sends_campaign" ON "marketing_sends" ("campaign_id", "status");
CREATE INDEX "marketing_sends_diner" ON "marketing_sends" ("diner_id", "sent_at" DESC);
CREATE INDEX "marketing_sends_resend" ON "marketing_sends" ("resend_message_id") WHERE "resend_message_id" IS NOT NULL;
CREATE INDEX "marketing_sends_twilio" ON "marketing_sends" ("twilio_message_sid") WHERE "twilio_message_sid" IS NOT NULL;

CREATE TABLE "marketing_quota_usage" (
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "year_month" date NOT NULL,
  "channel" marketing_channel NOT NULL,
  "sent_count" integer NOT NULL DEFAULT 0,
  "delivered_count" integer NOT NULL DEFAULT 0,
  "bounced_count" integer NOT NULL DEFAULT 0,
  "complained_count" integer NOT NULL DEFAULT 0,
  "included_allowance" integer NOT NULL,
  "overage_count" integer NOT NULL DEFAULT 0,
  "overage_billed_cents" integer NOT NULL DEFAULT 0,
  "last_alert_threshold" smallint NOT NULL DEFAULT 0,
  "computed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("organization_id", "year_month", "channel")
);

CREATE TABLE "marketing_link_clicks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "send_id" uuid NOT NULL REFERENCES marketing_sends(id) ON DELETE CASCADE,
  "link_token" varchar(20) NOT NULL,
  "destination_url" text NOT NULL,
  "clicked_at" timestamptz NOT NULL DEFAULT now(),
  "ip" inet,
  "user_agent" varchar(500)
);
CREATE INDEX "marketing_link_clicks_send" ON "marketing_link_clicks" ("send_id", "clicked_at" DESC);

CREATE TABLE "marketing_consent_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "diner_id" uuid REFERENCES diners(id) ON DELETE SET NULL,
  "organization_id" uuid REFERENCES organizations(id) ON DELETE SET NULL,
  "diner_id_at_event" uuid NOT NULL,
  "organization_id_at_event" uuid NOT NULL,
  "channel" marketing_channel NOT NULL,
  "event_type" varchar(40) NOT NULL,
  "reason" varchar(60),
  "actor_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "context" jsonb
);
CREATE INDEX "marketing_consent_audit_diner" ON "marketing_consent_audit" ("diner_id", "occurred_at" DESC);
CREATE INDEX "marketing_consent_audit_org" ON "marketing_consent_audit" ("organization_id", "occurred_at" DESC);

-- ── deferred cross FKs ───────────────────────────────────────────────────
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_segment_fk"
  FOREIGN KEY ("segment_id") REFERENCES marketing_segments(id) ON DELETE RESTRICT;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_campaign_fk"
  FOREIGN KEY ("campaign_id") REFERENCES marketing_campaigns(id) ON DELETE SET NULL;
ALTER TABLE "marketing_suppressions" ADD CONSTRAINT "marketing_suppressions_source_send_fk"
  FOREIGN KEY ("source_send_id") REFERENCES marketing_sends(id) ON DELETE SET NULL;

-- ── RLS (org members read; org admins write; service-role mutates sends/quota) ──
ALTER TABLE "restaurant_marketing_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurant_marketing_settings_admin_all" ON "restaurant_marketing_settings" FOR ALL USING (
  "restaurant_id" IN (SELECT r."id" FROM "restaurants" r JOIN "organization_members" m ON m."organization_id" = r."organization_id"
    WHERE m."user_id" = auth.uid() AND m."is_active" = true AND m."role" IN ('owner','admin')));

ALTER TABLE "marketing_campaigns" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_campaigns_member_select" ON "marketing_campaigns" FOR SELECT USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members" WHERE "user_id" = auth.uid() AND "is_active" = true));

ALTER TABLE "marketing_campaign_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_campaign_versions_member_select" ON "marketing_campaign_versions" FOR SELECT USING (
  "campaign_id" IN (SELECT c."id" FROM "marketing_campaigns" c JOIN "organization_members" m ON m."organization_id" = c."organization_id"
    WHERE m."user_id" = auth.uid() AND m."is_active" = true));

ALTER TABLE "marketing_segments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_segments_member_select" ON "marketing_segments" FOR SELECT USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members" WHERE "user_id" = auth.uid() AND "is_active" = true));

ALTER TABLE "marketing_sends" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_sends_member_select" ON "marketing_sends" FOR SELECT USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members" WHERE "user_id" = auth.uid() AND "is_active" = true));

ALTER TABLE "marketing_quota_usage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_quota_usage_org_admin_select" ON "marketing_quota_usage" FOR SELECT USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members" WHERE "user_id" = auth.uid() AND "is_active" = true AND "role" IN ('owner','admin')));

ALTER TABLE "marketing_link_clicks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketing_consent_audit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketing_consent_audit_org_select" ON "marketing_consent_audit" FOR SELECT USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members" WHERE "user_id" = auth.uid() AND "is_active" = true AND "role" IN ('owner','admin')));
