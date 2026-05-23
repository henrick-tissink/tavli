-- §06 §3 + §3.5 Wave 4 sub-unit J.1 — reviews polish columns + filtered aggregate trigger.
--
-- Adds 8 new columns for aggregate-consent, soft-hide/moderation, optimistic-lock
-- and audit timestamps. Replaces the reviews_recompute_aggregate trigger function
-- to filter out hidden, redacted, and non-consented rows.

ALTER TABLE "reviews"
  ADD COLUMN "include_in_aggregate_rating" boolean NOT NULL DEFAULT false,
  ADD COLUMN "aggregate_consent_at"        timestamptz,
  ADD COLUMN "is_hidden"                   boolean NOT NULL DEFAULT false,
  ADD COLUMN "hidden_reason"               varchar(60),
  ADD COLUMN "hidden_by_user_id"           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN "hidden_at"                   timestamptz,
  ADD COLUMN "updated_at"                  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN "revision"                    smallint NOT NULL DEFAULT 0;

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_gdpr_takedown_attribution"
    CHECK (hidden_reason != 'gdpr_takedown' OR hidden_by_user_id IS NOT NULL);

-- Replace trigger function body: only include rows that have passed aggregate
-- consent, are not hidden, and are not redacted.
CREATE OR REPLACE FUNCTION reviews_recompute_aggregate() RETURNS TRIGGER AS $$
DECLARE
  v_rid   UUID;
  v_avg   NUMERIC(2,1);
  v_count INTEGER;
BEGIN
  v_rid := COALESCE(NEW."restaurant_id", OLD."restaurant_id");

  -- Serialize concurrent recomputes per-restaurant to avoid race window.
  PERFORM 1 FROM "restaurants" WHERE id = v_rid FOR UPDATE;

  SELECT ROUND(AVG(rating)::numeric, 1), COUNT(*)
    INTO v_avg, v_count
    FROM "reviews"
    WHERE "restaurant_id" = v_rid
      AND is_hidden = false
      AND redacted_at IS NULL
      AND include_in_aggregate_rating = true;

  UPDATE "restaurants"
    SET "rating"      = v_avg,
        "vote_count"  = v_count,
        "updated_at"  = NOW()
    WHERE "id" = v_rid;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
