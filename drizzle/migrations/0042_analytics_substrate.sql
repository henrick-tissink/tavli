-- §07 — Analytics substrate (Wave 6 sub-unit A).
-- restaurants.timezone + 4 aggregate tables + export-jobs table +
-- service-label SQL fn + private `exports` storage bucket + RLS.
-- Aggregate tables are service-role-written (jobs); org members read.

-- ── restaurants.timezone ────────────────────────────────────────────────
ALTER TABLE "restaurants" ADD COLUMN "timezone" varchar(64) NOT NULL DEFAULT 'Europe/Bucharest';

-- ── reservation_daily_aggregates ────────────────────────────────────────
CREATE TABLE "reservation_daily_aggregates" (
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "business_date" date NOT NULL,
  "service_label" varchar(40) NOT NULL DEFAULT 'all_day',
  "bookings_created" integer NOT NULL DEFAULT 0,
  "bookings_for_date" integer NOT NULL DEFAULT 0,
  "confirmed_count" integer NOT NULL DEFAULT 0,
  "seated_count" integer NOT NULL DEFAULT 0,
  "completed_count" integer NOT NULL DEFAULT 0,
  "no_show_count" integer NOT NULL DEFAULT 0,
  "cancelled_count" integer NOT NULL DEFAULT 0,
  "covers_for_date" integer NOT NULL DEFAULT 0,
  "covers_completed" integer NOT NULL DEFAULT 0,
  "covers_no_show" integer NOT NULL DEFAULT 0,
  "party_size_1_2" integer NOT NULL DEFAULT 0,
  "party_size_3_4" integer NOT NULL DEFAULT 0,
  "party_size_5_6" integer NOT NULL DEFAULT 0,
  "party_size_7_plus" integer NOT NULL DEFAULT 0,
  "cancel_reason_restaurant_closed" integer NOT NULL DEFAULT 0,
  "cancel_reason_overbooked" integer NOT NULL DEFAULT 0,
  "cancel_reason_kitchen_issue" integer NOT NULL DEFAULT 0,
  "cancel_reason_private_event" integer NOT NULL DEFAULT 0,
  "cancel_reason_other" integer NOT NULL DEFAULT 0,
  "cancel_reason_diner" integer NOT NULL DEFAULT 0,
  "booking_type_standard" integer NOT NULL DEFAULT 0,
  "booking_type_private_event" integer NOT NULL DEFAULT 0,
  "booking_type_standing" integer NOT NULL DEFAULT 0,
  "lead_time_p50_min" integer,
  "lead_time_p90_min" integer,
  "lead_time_avg_min" integer,
  "source_widget" integer NOT NULL DEFAULT 0,
  "source_venue_page" integer NOT NULL DEFAULT 0,
  "source_editorial" integer NOT NULL DEFAULT 0,
  "source_corporate" integer NOT NULL DEFAULT 0,
  "source_walk_in" integer NOT NULL DEFAULT 0,
  "source_manual" integer NOT NULL DEFAULT 0,
  "source_unknown" integer NOT NULL DEFAULT 0,
  "new_diners" integer NOT NULL DEFAULT 0,
  "returning_diners" integer NOT NULL DEFAULT 0,
  "computed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("restaurant_id", "business_date", "service_label")
);
CREATE INDEX "reservation_daily_aggregates_date" ON "reservation_daily_aggregates" ("business_date" DESC);
CREATE INDEX "reservation_daily_aggregates_restaurant" ON "reservation_daily_aggregates" ("restaurant_id", "business_date" DESC);

-- ── reservation_hourly_aggregates (Pro) ─────────────────────────────────
CREATE TABLE "reservation_hourly_aggregates" (
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "day_of_week" smallint NOT NULL CHECK ("day_of_week" between 0 and 6),
  "hour_of_day" smallint NOT NULL CHECK ("hour_of_day" between 0 and 23),
  "window_start_date" date NOT NULL,
  "window_end_date" date NOT NULL,
  "total_bookings" integer NOT NULL DEFAULT 0,
  "no_show_count" integer NOT NULL DEFAULT 0,
  "no_show_rate" numeric(5, 4),
  "computed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("restaurant_id", "day_of_week", "hour_of_day", "window_end_date")
);

-- ── diner_cohort_aggregates (Pro, org-scoped) ───────────────────────────
CREATE TABLE "diner_cohort_aggregates" (
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "cohort_month" date NOT NULL,
  "month_offset" smallint NOT NULL CHECK ("month_offset" between 0 and 24),
  "cohort_size" integer NOT NULL,
  "retained_count" integer NOT NULL,
  "retention_rate" numeric(5, 4),
  "computed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("organization_id", "cohort_month", "month_offset")
);

-- ── restaurant_forecasts (Pro) ──────────────────────────────────────────
CREATE TABLE "restaurant_forecasts" (
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "forecast_date" date NOT NULL,
  "covers_predicted" integer NOT NULL,
  "covers_low" integer NOT NULL,
  "covers_high" integer NOT NULL,
  "bookings_already_confirmed" integer NOT NULL DEFAULT 0,
  "computed_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("restaurant_id", "forecast_date")
);

-- ── restaurant_export_jobs ──────────────────────────────────────────────
CREATE TABLE "restaurant_export_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "requested_by_user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "requested_restaurants" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "format" varchar(20) NOT NULL DEFAULT 'csv',
  "date_from" date,
  "date_to" date,
  "tables" text[] NOT NULL DEFAULT array['reservations','diners','reviews']::text[],
  "bypass_tier_limit_reason" varchar(40),
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  "storage_path" text,
  "signed_url_expires_at" timestamptz,
  "row_count" integer,
  "size_bytes" integer,
  "failure_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "ready_at" timestamptz,
  "expired_at" timestamptz
);
CREATE INDEX "restaurant_export_jobs_org" ON "restaurant_export_jobs" ("organization_id", "created_at" DESC);
CREATE INDEX "restaurant_export_jobs_status" ON "restaurant_export_jobs" ("status") WHERE "status" IN ('queued','running');

-- ── service-label heuristic fn (§5.1a) ──────────────────────────────────
-- Maps a venue-local reservation_time to a service bucket. Windows are
-- inclusive of start, exclusive of end; ties break to the earlier service
-- (brunch>lunch at 12:30; dinner>late at 22:00); no match → all_day.
-- IMMUTABLE so it can be used in generated columns / indexes later.
CREATE OR REPLACE FUNCTION analytics_service_label_for_hour(t time)
RETURNS varchar(40)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN t >= time '10:00' AND t < time '13:00' THEN 'brunch'
    WHEN t >= time '11:00' AND t < time '15:00' THEN 'lunch'
    WHEN t >= time '17:00' AND t < time '23:00' THEN 'dinner'
    -- late wraps midnight: 21:00–23:59 or 00:00–02:00
    WHEN (t >= time '21:00') OR (t < time '02:00') THEN 'late'
    ELSE 'all_day'
  END;
$$;

-- ── private `exports` bucket ─────────────────────────────────────────────
-- Holds generated export ZIPs (contain diner PII). Private — reads only via
-- service-role-minted 24h signed URLs. 1 GB per-file cap.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('exports', 'exports', false, 1073741824)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = excluded.file_size_limit, public = excluded.public;
-- No anon/authenticated storage.objects policy: the export bucket is
-- service-role-only; clients never read it directly (signed URL only).

-- ── RLS (§4.5): org members SELECT their org's aggregates; service-role
-- (jobs) bypasses RLS entirely; mutations have no client policy. ──────────
ALTER TABLE "reservation_daily_aggregates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservation_daily_aggregates_member_select" ON "reservation_daily_aggregates" FOR SELECT USING (
  "restaurant_id" IN (SELECT r."id" FROM "restaurants" r
    JOIN "organization_members" m ON m."organization_id" = r."organization_id"
    WHERE m."user_id" = auth.uid() AND m."is_active" = true));

ALTER TABLE "reservation_hourly_aggregates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reservation_hourly_aggregates_member_select" ON "reservation_hourly_aggregates" FOR SELECT USING (
  "restaurant_id" IN (SELECT r."id" FROM "restaurants" r
    JOIN "organization_members" m ON m."organization_id" = r."organization_id"
    WHERE m."user_id" = auth.uid() AND m."is_active" = true));

ALTER TABLE "diner_cohort_aggregates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diner_cohort_aggregates_member_select" ON "diner_cohort_aggregates" FOR SELECT USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members"
    WHERE "user_id" = auth.uid() AND "is_active" = true));

ALTER TABLE "restaurant_forecasts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurant_forecasts_member_select" ON "restaurant_forecasts" FOR SELECT USING (
  "restaurant_id" IN (SELECT r."id" FROM "restaurants" r
    JOIN "organization_members" m ON m."organization_id" = r."organization_id"
    WHERE m."user_id" = auth.uid() AND m."is_active" = true));

-- Export jobs: org admins read their org's jobs (download links). Inserts
-- go through the service-role create-action after a requireCan gate.
ALTER TABLE "restaurant_export_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurant_export_jobs_admin_select" ON "restaurant_export_jobs" FOR SELECT USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members"
    WHERE "user_id" = auth.uid() AND "is_active" = true AND "role" IN ('owner','admin')));
