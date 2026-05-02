-- 0006_reviews.sql
-- Verified-reservation reviews: every review is anchored to a real
-- reservation. Aggregate rating + count denormalised onto restaurants
-- via trigger so the consumer card path stays a single read.

ALTER TABLE "reservations"
  ADD COLUMN "post_visit_email_sent_at" TIMESTAMPTZ;

CREATE TABLE "reviews" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "reservation_id" UUID NOT NULL UNIQUE
    REFERENCES "reservations"("id") ON DELETE CASCADE,
  "restaurant_id"  UUID NOT NULL
    REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "rating"         SMALLINT NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "comment"        TEXT,
  "first_name"     TEXT NOT NULL,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "reviews_restaurant_created_idx"
  ON "reviews" ("restaurant_id", "created_at" DESC);

CREATE OR REPLACE FUNCTION "fn_reviews_after_insert"() RETURNS TRIGGER AS $$
DECLARE
  v_avg   NUMERIC(2,1);
  v_count INTEGER;
BEGIN
  SELECT ROUND(AVG(rating)::numeric, 1), COUNT(*)
    INTO v_avg, v_count
    FROM "reviews"
    WHERE "restaurant_id" = NEW."restaurant_id";

  UPDATE "restaurants"
    SET "rating"      = v_avg,
        "vote_count"  = v_count,
        "updated_at"  = NOW()
    WHERE "id" = NEW."restaurant_id";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_reviews_after_insert"
  AFTER INSERT ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION "fn_reviews_after_insert"();

ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;

-- Public can read reviews of live restaurants. Inserts/updates/deletes
-- are blocked for anon/authenticated; only the service role (via
-- createSupabaseAdminClient) can write — same pattern as reservations.
CREATE POLICY "reviews_public_read" ON "reviews"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "restaurants" r
      WHERE r.id = "reviews"."restaurant_id"
        AND r.status = 'live'
    )
  );
