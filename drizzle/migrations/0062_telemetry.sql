-- Venue telemetry backing the partner overview stat cards.
--
-- restaurant_view_events: one row per venue-page view. Deliberately carries
-- NO user/device identifier — countable, not trackable, consistent with the
-- "essential cookies only, no tracking" notice.
--
-- restaurant_saves: server-side mirror of the diner device's saved list,
-- keyed by a client-generated random id the device already stores locally.
-- Insert on save, delete on unsave; count = "customers who saved you".

CREATE TABLE "restaurant_view_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "locale" char(2)
);

CREATE INDEX "restaurant_view_events_restaurant_time"
  ON "restaurant_view_events" (restaurant_id, occurred_at DESC);

CREATE TABLE "restaurant_saves" (
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "client_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("restaurant_id", "client_id")
);

-- Service-role only: written via API routes, read by the partner dashboard
-- through the service client. RLS enabled with no policies denies anon and
-- authenticated roles outright (matching the translations tables' posture).
ALTER TABLE "restaurant_view_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_saves" ENABLE ROW LEVEL SECURITY;
