-- 0067_standing_reservations
-- Corporate Phase 4: partner-managed recurring (standing) reservations.
-- A venue defines a weekly/fortnightly series that holds a specific table;
-- occurrences are materialized as real reservations (booking_type='standing',
-- standing_id set) up to a rolling horizon. Additive only; safe ahead of code.

CREATE TYPE "standing_status" AS ENUM ('active', 'cancelled');

CREATE TABLE "standing_reservations" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id"        UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "day_of_week"          SMALLINT NOT NULL,
  "start_time"           TIME NOT NULL,
  "party_size"           SMALLINT NOT NULL,
  "interval_weeks"       SMALLINT NOT NULL DEFAULT 1,
  "table_id"             UUID NOT NULL REFERENCES "restaurant_tables"("id") ON DELETE CASCADE,
  "guest_name"           TEXT NOT NULL,
  "guest_phone"          VARCHAR(40) NOT NULL,
  "guest_email"          VARCHAR(255),
  "notes"                TEXT,
  "start_date"           DATE NOT NULL,
  "end_date"             DATE,
  "status"               "standing_status" NOT NULL DEFAULT 'active',
  "materialized_through" DATE,
  "created_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "sr_dow_range"      CHECK ("day_of_week" BETWEEN 0 AND 6),
  CONSTRAINT "sr_party_positive" CHECK ("party_size" >= 1),
  CONSTRAINT "sr_interval_valid" CHECK ("interval_weeks" IN (1, 2)),
  CONSTRAINT "sr_date_order"     CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
);

CREATE INDEX "sr_restaurant_status_idx" ON "standing_reservations" ("restaurant_id", "status");

ALTER TABLE "reservations"
  ADD COLUMN "standing_id" UUID REFERENCES "standing_reservations"("id") ON DELETE SET NULL;

CREATE INDEX "reservations_standing_idx"
  ON "reservations" ("standing_id")
  WHERE "standing_id" IS NOT NULL;

CREATE TRIGGER "trg_standing_reservations_touch_updated_at"
  BEFORE UPDATE ON "standing_reservations"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();

-- No anon policies: all access via the service role (dbAdmin), mirroring
-- meeting_space_bookings (0066).
ALTER TABLE "standing_reservations" ENABLE ROW LEVEL SECURITY;
