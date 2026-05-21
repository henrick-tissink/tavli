-- 0014_org_ownership_swap.sql
-- §3.6 sub-unit A. Adds restaurants.organization_id (NOT NULL) and
-- profiles.default_organization_id, with a backfill from the existing
-- restaurants.owner_user_id data. owner_user_id is intentionally retained
-- until sub-unit C (deferred — the 27 ad-hoc callsites still read it).
--
-- Phases:
--   1. Pre-flight: assert no auth.users/profiles drift.
--   2. Add nullable columns.
--   3. Backfill via DO block — one org per distinct owner_user_id, with
--      org_owner membership + venue_owner restaurant_staff rows.
--   4. Orphan check — fail if any restaurant lacks organization_id.
--   5. Lockdown — SET NOT NULL + add restaurants_organization_idx.
--
-- Entire migration runs in one transaction; failure rolls back atomically.

BEGIN;

-- ─── Phase 1: pre-flight assertion ──────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "restaurants" r
    LEFT JOIN "profiles" p ON p."id" = r."owner_user_id"
    WHERE r."owner_user_id" IS NOT NULL AND p."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'restaurants.owner_user_id references profiles row that does not exist (auth.users/profiles drift) — fix before backfilling';
  END IF;
END $$;

-- ─── Phase 2: add columns nullable ──────────────────────────────────────
ALTER TABLE "restaurants"
  ADD COLUMN "organization_id" uuid REFERENCES "organizations"("id") ON DELETE RESTRICT;

ALTER TABLE "profiles"
  ADD COLUMN "default_organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL;

-- ─── Phase 3: backfill ──────────────────────────────────────────────────
DO $$
DECLARE
  owner_id uuid;
  partner_email text;
  partner_locale varchar(2);
  partner_org_name text;
  new_org_id uuid;
BEGIN
  FOR owner_id, partner_email, partner_locale IN
    SELECT DISTINCT r."owner_user_id", p."email", SUBSTRING(p."locale" FOR 2)
    FROM "restaurants" r
    JOIN "profiles" p ON p."id" = r."owner_user_id"
    WHERE r."owner_user_id" IS NOT NULL
  LOOP
    SELECT "name" INTO partner_org_name
    FROM "restaurants"
    WHERE "owner_user_id" = owner_id
    ORDER BY "created_at" ASC
    LIMIT 1;

    INSERT INTO "organizations" ("name", "primary_contact_email", "locale", "status")
    VALUES (partner_org_name, partner_email, partner_locale, 'active')
    RETURNING "id" INTO new_org_id;

    INSERT INTO "organization_members" ("organization_id", "user_id", "role", "is_active")
    VALUES (new_org_id, owner_id, 'owner', true);

    INSERT INTO "restaurant_staff" ("restaurant_id", "user_id", "role", "is_active")
    SELECT "id", owner_id, 'owner', true
    FROM "restaurants"
    WHERE "owner_user_id" = owner_id;

    UPDATE "restaurants"
    SET "organization_id" = new_org_id
    WHERE "owner_user_id" = owner_id;

    UPDATE "profiles"
    SET "default_organization_id" = new_org_id
    WHERE "id" = owner_id;
  END LOOP;
END $$;

-- ─── Phase 4: orphan check ──────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "restaurants" WHERE "organization_id" IS NULL) THEN
    RAISE EXCEPTION 'Backfill incomplete — restaurants remain without organization_id (likely owner_user_id IS NULL rows); resolve manually before re-applying';
  END IF;
END $$;

-- ─── Phase 5: lockdown + index ──────────────────────────────────────────
ALTER TABLE "restaurants" ALTER COLUMN "organization_id" SET NOT NULL;

CREATE INDEX "restaurants_organization_idx" ON "restaurants" USING btree ("organization_id");

COMMIT;
