-- 0007_reviews_snapshot_context.sql
-- Snapshot booking context (party_size, reservation_date) onto reviews so
-- the diner-facing detail page can render review rows without joining
-- reservations. Reservations are owner-only by RLS, so anon-side joins
-- silently return null and the review card was rendering "0 persoane".
-- Denormalizing also avoids exposing other reservation columns (guest
-- name/phone/email/notes) to anon, which a column-restricted RLS policy
-- couldn't safely do.

-- Add nullable, backfill from the source reservation, then enforce NOT NULL.
ALTER TABLE "reviews" ADD COLUMN "party_size" smallint;
ALTER TABLE "reviews" ADD COLUMN "reservation_date" date;

UPDATE "reviews" rev
   SET "party_size"       = resv."party_size",
       "reservation_date" = resv."reservation_date"
  FROM "reservations" resv
 WHERE resv."id" = rev."reservation_id";

ALTER TABLE "reviews" ALTER COLUMN "party_size"       SET NOT NULL;
ALTER TABLE "reviews" ALTER COLUMN "reservation_date" SET NOT NULL;
