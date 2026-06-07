-- 0066_meeting_spaces
-- Corporate Phase 2: hourly bookable work/meeting spaces (spec
-- docs/superpowers/specs/2026-06-06-meeting-spaces-design.md).
--
-- Request-to-book: bookings land as 'requested' and a partner confirms or
-- declines. Both 'requested' and 'confirmed' hold the slot; the guard
-- trigger (pattern: 0064/0065) raises TV004 on overlap and TV005 when a
-- booking falls outside the space's bookable window or under its minimum
-- duration. Additive only; safe to apply ahead of code.

ALTER TABLE "restaurants"
  ADD COLUMN "accepts_meeting_spaces" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TYPE "meeting_space_booking_status" AS ENUM
  ('requested', 'confirmed', 'declined', 'cancelled', 'completed');

CREATE TABLE "meeting_spaces" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id"       UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "name"                VARCHAR(120) NOT NULL,
  "description"         TEXT,
  "capacity"            INTEGER NOT NULL,
  "hourly_rate_cents"   INTEGER NOT NULL DEFAULT 0,
  "amenities"           TEXT[] NOT NULL DEFAULT '{}',
  "open_time"           TIME NOT NULL DEFAULT '09:00',
  "close_time"          TIME NOT NULL DEFAULT '18:00',
  "min_booking_minutes" INTEGER NOT NULL DEFAULT 60,
  "photo_storage_path"  TEXT,
  "sort_order"          INTEGER NOT NULL DEFAULT 0,
  "is_active"           BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "ms_capacity_positive"    CHECK ("capacity" >= 1),
  CONSTRAINT "ms_rate_nonnegative"     CHECK ("hourly_rate_cents" >= 0),
  CONSTRAINT "ms_hours_order"          CHECK ("open_time" < "close_time"),
  CONSTRAINT "ms_min_booking_positive" CHECK ("min_booking_minutes" >= 15)
);

CREATE INDEX "ms_restaurant_active_idx"
  ON "meeting_spaces" ("restaurant_id")
  WHERE "is_active" = TRUE;

CREATE TABLE "meeting_space_bookings" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "meeting_space_id"   UUID NOT NULL REFERENCES "meeting_spaces"("id") ON DELETE CASCADE,
  "restaurant_id"      UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "booking_date"       DATE NOT NULL,
  "start_time"         TIME NOT NULL,
  "end_time"           TIME NOT NULL,
  "party_size"         INTEGER NOT NULL,
  "guest_name"         VARCHAR(120) NOT NULL,
  "guest_email"        VARCHAR(255) NOT NULL,
  "guest_phone"        VARCHAR(40),
  "company"            VARCHAR(160),
  "notes"              TEXT,
  "status"             "meeting_space_booking_status" NOT NULL DEFAULT 'requested',
  "total_cents"        INTEGER NOT NULL,
  "confirmation_token" UUID NOT NULL DEFAULT gen_random_uuid(),
  "created_at"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "msb_time_order"     CHECK ("end_time" > "start_time"),
  CONSTRAINT "msb_party_positive" CHECK ("party_size" >= 1),
  CONSTRAINT "msb_total_nonneg"   CHECK ("total_cents" >= 0)
);

CREATE INDEX "msb_restaurant_status_idx" ON "meeting_space_bookings" ("restaurant_id", "status");
CREATE INDEX "msb_space_date_idx"        ON "meeting_space_bookings" ("meeting_space_id", "booking_date");

-- updated_at touch triggers (fn_touch_updated_at exists since 0010-era).
CREATE TRIGGER "trg_meeting_spaces_touch_updated_at"
  BEFORE UPDATE ON "meeting_spaces"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();

CREATE TRIGGER "trg_meeting_space_bookings_touch_updated_at"
  BEFORE UPDATE ON "meeting_space_bookings"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();

-- RLS. Catalogue is publicly readable (anon detail page) for active spaces of
-- live venues, mirroring private_spaces_public_read (0010). Bookings have NO
-- anon policies: every read/write goes through the service role (dbAdmin).
ALTER TABLE "meeting_spaces"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meeting_space_bookings"  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_spaces_public_read" ON "meeting_spaces" FOR SELECT
  USING ("is_active" = TRUE AND EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "meeting_spaces"."restaurant_id"
      AND r."status" = 'live'
  ));

-- Guard trigger (house pattern, cf. reservations_check_capacity in 0064/0065):
-- advisory lock per (space, date), then validate hours/duration (TV005) and
-- [start,end) overlap against other active bookings (TV004). 'requested' holds
-- the slot by design — declining/cancelling releases it.
CREATE OR REPLACE FUNCTION public.meeting_space_bookings_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_open  time;
  v_close time;
  v_min   int;
BEGIN
  IF new.status NOT IN ('requested', 'confirmed') THEN
    RETURN new;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(new.meeting_space_id::text || ':' || new.booking_date::text, 0)
  );

  SELECT open_time, close_time, min_booking_minutes
    INTO v_open, v_close, v_min
  FROM public.meeting_spaces
  WHERE id = new.meeting_space_id;

  IF v_open IS NULL THEN
    RAISE EXCEPTION 'Meeting space not found' USING ERRCODE = 'TV005';
  END IF;

  IF new.start_time < v_open
     OR new.end_time > v_close
     OR (extract(epoch FROM (new.end_time - new.start_time)) / 60) < v_min THEN
    RAISE EXCEPTION 'Outside the space''s bookable hours' USING ERRCODE = 'TV005';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.meeting_space_bookings b
    WHERE b.meeting_space_id = new.meeting_space_id
      AND b.booking_date = new.booking_date
      AND b.status IN ('requested', 'confirmed')
      AND b.id <> new.id
      AND b.start_time < new.end_time
      AND new.start_time < b.end_time
  ) THEN
    RAISE EXCEPTION 'Space already booked for that time' USING ERRCODE = 'TV004';
  END IF;

  RETURN new;
END;
$$;

CREATE TRIGGER "meeting_space_bookings_guard"
BEFORE INSERT OR UPDATE OF "status", "booking_date", "start_time", "end_time", "meeting_space_id"
ON "meeting_space_bookings"
FOR EACH ROW EXECUTE FUNCTION public.meeting_space_bookings_check();
