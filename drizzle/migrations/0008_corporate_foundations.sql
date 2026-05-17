-- 0008_corporate_foundations.sql
-- Foundations for corporate-bookings Phase 1 (private events).
-- All new venues default OFF for every capability; no behaviour change for
-- existing listings at deploy time.

-- ─── enums ──────────────────────────────────────────────────────────────
CREATE TYPE "company_status" AS ENUM ('pending_verification', 'active', 'suspended');
CREATE TYPE "company_member_role" AS ENUM ('owner', 'admin', 'booker', 'viewer');
CREATE TYPE "event_occasion" AS ENUM ('wedding', 'birthday', 'corporate_dinner', 'product_launch', 'other');
CREATE TYPE "event_request_status" AS ENUM (
  'draft', 'new', 'viewing', 'replied', 'quoted',
  'accepted', 'declined', 'expired_quote', 'cancelled', 'expired', 'completed'
);
CREATE TYPE "booking_type" AS ENUM ('standard', 'private_event', 'standing');

-- ─── restaurants additions ──────────────────────────────────────────────
ALTER TABLE "restaurants"
  ADD COLUMN "events_intake_enabled"   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "accepts_corporate_meals" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "accepts_standing"        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "pro_plan_active"         BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX "restaurants_events_intake_idx"
  ON "restaurants" ("events_intake_enabled") WHERE "events_intake_enabled" = TRUE;

-- ─── companies ──────────────────────────────────────────────────────────
CREATE TABLE "companies" (
  "id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"                     TEXT NOT NULL,
  "legal_name"               TEXT,
  "cui"                      VARCHAR(20) NOT NULL UNIQUE,
  "reg_com"                  VARCHAR(40),
  "billing_address"          TEXT,
  "billing_city"             TEXT,
  "billing_country"          VARCHAR(2) NOT NULL DEFAULT 'RO',
  "vat_payer"                BOOLEAN NOT NULL DEFAULT FALSE,
  "efactura_enabled"         BOOLEAN NOT NULL DEFAULT TRUE,
  "primary_contact_email"    VARCHAR(255),
  "primary_contact_phone"    VARCHAR(32),
  "status"                   company_status NOT NULL DEFAULT 'pending_verification',
  "verified_at"              TIMESTAMPTZ,
  "verified_by_user_id"      UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "companies_status_idx" ON "companies" ("status");

-- ─── company_members ────────────────────────────────────────────────────
CREATE TABLE "company_members" (
  "company_id"            UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "user_id"               UUID NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "role"                  company_member_role NOT NULL DEFAULT 'booker',
  "budget_monthly_cents"  INTEGER,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("company_id", "user_id")
);
CREATE INDEX "company_members_user_idx" ON "company_members" ("user_id");

-- ─── company_invitations ────────────────────────────────────────────────
CREATE TABLE "company_invitations" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id"          UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "email"               VARCHAR(255) NOT NULL,
  "role"                company_member_role NOT NULL DEFAULT 'booker',
  "token_hash"          VARCHAR(64) NOT NULL UNIQUE,
  "invited_by_user_id"  UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "expires_at"          TIMESTAMPTZ NOT NULL,
  "status"              invitation_status NOT NULL DEFAULT 'pending',
  "claimed_at"          TIMESTAMPTZ,
  "claimed_by_user_id"  UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "company_invitations_company_idx" ON "company_invitations" ("company_id");
CREATE INDEX "company_invitations_email_status_idx" ON "company_invitations" ("email", "status");

-- ─── event_requests ─────────────────────────────────────────────────────
CREATE TABLE "event_requests" (
  "id"                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id"            UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "company_id"               UUID REFERENCES "companies"("id") ON DELETE SET NULL,
  "claimed_company_cui"      VARCHAR(20),
  "claimed_company_name"     TEXT,
  "requested_by_user_id"     UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  "guest_name"               TEXT NOT NULL,
  "guest_email"              VARCHAR(255) NOT NULL,
  "guest_phone"              VARCHAR(32),
  "occasion"                 event_occasion NOT NULL,
  "event_date"               DATE NOT NULL,
  "event_time_preference"    TEXT,
  "party_size"               SMALLINT NOT NULL CHECK ("party_size" > 0),
  "space_preference"         TEXT,
  "budget_per_head_cents"    INTEGER,
  "menu_preference"          TEXT,
  "dietary_notes"            TEXT,
  "additional_notes"         TEXT,
  "status"                   event_request_status NOT NULL DEFAULT 'draft',
  "partner_response"         TEXT,
  "quoted_amount_cents"      INTEGER,
  "quoted_at"                TIMESTAMPTZ,
  "quote_expires_at"         TIMESTAMPTZ,
  "accepted_at"              TIMESTAMPTZ,
  "declined_at"              TIMESTAMPTZ,
  "cancelled_at"             TIMESTAMPTZ,
  "completed_at"             TIMESTAMPTZ,
  "decline_reason"           TEXT,
  "tracking_token"           VARCHAR(64) NOT NULL UNIQUE,
  "last_nudge_at"            TIMESTAMPTZ,
  "created_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "event_requests_restaurant_status_idx"
  ON "event_requests" ("restaurant_id", "status");
CREATE INDEX "event_requests_status_created_idx"
  ON "event_requests" ("status", "created_at");
CREATE INDEX "event_requests_user_idx" ON "event_requests" ("requested_by_user_id");
CREATE INDEX "event_requests_company_idx" ON "event_requests" ("company_id");
CREATE INDEX "event_requests_claim_idx" ON "event_requests" ("claimed_company_cui");

-- ─── restaurant_event_settings ──────────────────────────────────────────
CREATE TABLE "restaurant_event_settings" (
  "restaurant_id"             UUID PRIMARY KEY REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "min_party_size"            SMALLINT,
  "max_party_size"            SMALLINT,
  "min_lead_days"             SMALLINT NOT NULL DEFAULT 7,
  "accepted_occasions"        event_occasion[] NOT NULL DEFAULT '{}',
  "budget_per_head_guidance"  TEXT,
  "auto_reply_template"       TEXT,
  "blackout_dates"            JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── availability_exceptions ────────────────────────────────────────────
CREATE TABLE "availability_exceptions" (
  "id"                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id"               UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "exception_date"              DATE NOT NULL,
  "slot_start"                  TIME,
  "slot_end"                    TIME,
  "override_capacity"           INTEGER NOT NULL CHECK ("override_capacity" >= 0),
  "reason"                      TEXT,
  "source_event_request_id"     UUID REFERENCES "event_requests"("id") ON DELETE SET NULL,
  "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "availability_exceptions_restaurant_date_idx"
  ON "availability_exceptions" ("restaurant_id", "exception_date");

-- Refinement: prevent duplicate overrides for the same restaurant/date/slot.
-- COALESCE collapses NULL slot bounds (full-day overrides) onto sentinel
-- values so the unique constraint catches both slot-level and full-day dupes.
CREATE UNIQUE INDEX "availability_exceptions_unique"
  ON "availability_exceptions" (
    "restaurant_id",
    "exception_date",
    COALESCE("slot_start", '00:00:00'::time),
    COALESCE("slot_end",   '23:59:59'::time)
  );

-- ─── partner_notifications ──────────────────────────────────────────────
CREATE TABLE "partner_notifications" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id"  UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "kind"           VARCHAR(40) NOT NULL,
  "payload"        JSONB NOT NULL DEFAULT '{}'::jsonb,
  "read_at"        TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Refinement: partial index optimized for "show unread, newest first" — the
-- only query shape the bell-icon surface issues. Skips the (much larger)
-- already-read tail entirely.
CREATE INDEX "partner_notifications_restaurant_unread_idx"
  ON "partner_notifications" ("restaurant_id", "created_at" DESC)
  WHERE "read_at" IS NULL;

-- ─── reservations additions ─────────────────────────────────────────────
ALTER TABLE "reservations"
  ADD COLUMN "booking_type"        booking_type NOT NULL DEFAULT 'standard',
  ADD COLUMN "company_id"          UUID REFERENCES "companies"("id") ON DELETE SET NULL,
  ADD COLUMN "booked_by_user_id"   UUID REFERENCES "profiles"("id") ON DELETE SET NULL,
  ADD COLUMN "event_request_id"    UUID REFERENCES "event_requests"("id") ON DELETE SET NULL;

CREATE INDEX "reservations_event_request_idx"
  ON "reservations" ("event_request_id") WHERE "event_request_id" IS NOT NULL;

-- ─── SECURITY DEFINER token lookup (mirrors confirmation_token pattern) ─
CREATE OR REPLACE FUNCTION "get_event_request_by_token"(p_token TEXT)
RETURNS SETOF "event_requests"
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM "event_requests"
  WHERE "tracking_token" = p_token
    AND "status" <> 'draft'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION "get_event_request_by_token"(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "get_event_request_by_token"(TEXT) TO anon, authenticated;

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_event_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "availability_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partner_notifications" ENABLE ROW LEVEL SECURITY;

-- companies: members can read; owner/admin can update
CREATE POLICY "companies_member_read" ON "companies" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "company_members" cm
    WHERE cm."company_id" = "companies"."id"
      AND cm."user_id" = auth.uid()
  ));

CREATE POLICY "companies_admin_update" ON "companies" FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "company_members" cm
    WHERE cm."company_id" = "companies"."id"
      AND cm."user_id" = auth.uid()
      AND cm."role" IN ('owner', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "company_members" cm
    WHERE cm."company_id" = "companies"."id"
      AND cm."user_id" = auth.uid()
      AND cm."role" IN ('owner', 'admin')
  ));

-- company_members: members can read their own org
CREATE POLICY "company_members_self_read" ON "company_members" FOR SELECT
  USING ("user_id" = auth.uid() OR EXISTS (
    SELECT 1 FROM "company_members" cm
    WHERE cm."company_id" = "company_members"."company_id"
      AND cm."user_id" = auth.uid()
  ));

-- event_requests: visible to (a) restaurant owner via ownership, (b) the
-- requesting user, (c) company members. Token holders use the SECURITY
-- DEFINER function — NOT RLS.
CREATE POLICY "event_requests_owner_read" ON "event_requests" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "restaurants" r
      WHERE r."id" = "event_requests"."restaurant_id"
        AND r."owner_user_id" = auth.uid()
    )
    OR "requested_by_user_id" = auth.uid()
    OR (
      "company_id" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "company_members" cm
        WHERE cm."company_id" = "event_requests"."company_id"
          AND cm."user_id" = auth.uid()
      )
    )
  );

-- restaurant_event_settings: public read; owner write
CREATE POLICY "restaurant_event_settings_public_read"
  ON "restaurant_event_settings" FOR SELECT USING (TRUE);

CREATE POLICY "restaurant_event_settings_owner_write"
  ON "restaurant_event_settings" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "restaurant_event_settings"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "restaurant_event_settings"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ));

-- availability_exceptions: public read; owner write
CREATE POLICY "availability_exceptions_public_read"
  ON "availability_exceptions" FOR SELECT USING (TRUE);

CREATE POLICY "availability_exceptions_owner_write"
  ON "availability_exceptions" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "availability_exceptions"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "availability_exceptions"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ));

-- partner_notifications: only that restaurant's owner
CREATE POLICY "partner_notifications_owner_read"
  ON "partner_notifications" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "partner_notifications"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ));

CREATE POLICY "partner_notifications_owner_update"
  ON "partner_notifications" FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "partner_notifications"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "partner_notifications"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ));

-- ─── updated_at touch trigger ───────────────────────────────────────────
-- The plan assumes fn_touch_updated_at() exists from 0001_rls_and_triggers.sql.
-- It does not (verified via grep at migration-authoring time), so we define
-- it inline here. Subsequent migrations can reuse this same function.
CREATE OR REPLACE FUNCTION "fn_touch_updated_at"() RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_companies_touch_updated_at"
  BEFORE UPDATE ON "companies"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();

CREATE TRIGGER "trg_event_requests_touch_updated_at"
  BEFORE UPDATE ON "event_requests"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();

CREATE TRIGGER "trg_restaurant_event_settings_touch_updated_at"
  BEFORE UPDATE ON "restaurant_event_settings"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();
