-- §09 — Multi-location substrate (Wave 5 sub-unit A).
-- organizations brand + venue-counter columns, restaurants.archived_at,
-- venue_addition_log table + RLS, and a backfill of current_venue_count.

ALTER TABLE "organizations"
  ADD COLUMN "max_venues" integer,
  ADD COLUMN "current_venue_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "brand_primary" varchar(7),
  ADD COLUMN "brand_secondary" varchar(7);

ALTER TABLE "restaurants"
  ADD COLUMN "archived_at" timestamptz;

-- Backfill the counter so it starts correct (live = archived_at IS NULL).
UPDATE "organizations" o
SET "current_venue_count" = (
  SELECT count(*) FROM "restaurants" r
  WHERE r."organization_id" = o."id" AND r."archived_at" IS NULL
);

CREATE TABLE "venue_addition_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "action" varchar(20) NOT NULL,
  "by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "venue_count_after" integer NOT NULL,
  "billing_impact_cents" integer,
  "stripe_subscription_item_id" varchar(80),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "venue_addition_log_org" ON "venue_addition_log" ("organization_id", "created_at" DESC);

ALTER TABLE "venue_addition_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_addition_log_org_admin_read" ON "venue_addition_log"
  FOR SELECT USING (
    "organization_id" IN (
      SELECT "organization_id" FROM "organization_members"
      WHERE "user_id" = auth.uid() AND "is_active" = true AND "role" IN ('owner', 'admin')
    )
  );
-- INSERT is service-role only (the venue actions run with the admin client); no INSERT policy.
