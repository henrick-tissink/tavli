-- 0053_reviews_backfill_diner_id
-- C2 (round-3 audit): submitReviewByToken historically inserted reviews with
-- no diner_id, so the §03 GDPR erasure cascade (which redacts reviews WHERE
-- diner_id = $erasedDiner) could never reach them. The code is now fixed to
-- stamp diner_id on insert; this backfills existing rows from their
-- reservation's diner_id so already-submitted reviews become erasure-reachable.
--
-- Additive data backfill (no DROP/TRUNCATE); only fills NULLs, never overwrites.
-- Idempotent and safe to apply ahead of code. (Prod is pre-launch / 0 reviews,
-- so this is belt-and-suspenders there; it protects seed/local + any early rows.)

UPDATE "reviews" r
SET "diner_id" = res."diner_id"
FROM "reservations" res
WHERE r."reservation_id" = res."id"
  AND r."diner_id" IS NULL
  AND res."diner_id" IS NOT NULL;
