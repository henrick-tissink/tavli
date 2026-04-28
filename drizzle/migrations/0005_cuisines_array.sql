-- Multi-cuisine support: a restaurant can serve more than one cuisine.
-- Migration order is intentional: add → backfill → drop, so a rolling
-- deployment never sees both a missing column and a missing destination.
ALTER TABLE "restaurants" ADD COLUMN "cuisines" text[] NOT NULL DEFAULT '{}'::text[];

UPDATE "restaurants" SET "cuisines" = ARRAY["cuisine"] WHERE "cuisine" IS NOT NULL AND "cuisine" <> '';

ALTER TABLE "restaurants" DROP COLUMN "cuisine";
