-- §14 — Setup tooling (Wave 8 sub-unit S1).
-- 3 enums + setup_progress + migration_imports + reservations.migration_import_id
-- + the seed-on-restaurant-insert trigger + RLS.

CREATE TYPE "setup_step_key" AS ENUM ('migration', 'page_and_photos', 'staff_training', 'parallel_run', 'first_campaigns');
CREATE TYPE "setup_step_status" AS ENUM ('not_started', 'scheduled', 'in_progress', 'completed', 'skipped');
CREATE TYPE "migration_source" AS ENUM ('tavli_csv_template', 'opentable', 'sevenrooms', 'resy', 'ialoc', 'manual', 'none');

CREATE TABLE "setup_progress" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "restaurant_id" uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  "step_key" setup_step_key NOT NULL,
  "status" setup_step_status NOT NULL DEFAULT 'not_started',
  "scheduled_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "skipped_reason" varchar(120),
  "notes" text,
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "assigned_founder_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "setup_progress_org_restaurant_step" ON "setup_progress" ("organization_id", "restaurant_id", "step_key");
CREATE INDEX "setup_progress_org" ON "setup_progress" ("organization_id");
CREATE INDEX "setup_progress_status" ON "setup_progress" ("status", "scheduled_at") WHERE "status" IN ('not_started', 'scheduled');

CREATE TABLE "migration_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "source" migration_source NOT NULL,
  "source_file_storage_path" text,
  "status" varchar(20) NOT NULL DEFAULT 'queued',
  "reservations_imported" integer NOT NULL DEFAULT 0,
  "reservations_skipped" integer NOT NULL DEFAULT 0,
  "reservations_failed" integer NOT NULL DEFAULT 0,
  "diners_imported" integer NOT NULL DEFAULT 0,
  "diners_merged" integer NOT NULL DEFAULT 0,
  "error_log" jsonb,
  "imported_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "migration_imports_restaurant" ON "migration_imports" ("restaurant_id", "created_at" DESC);

ALTER TABLE "reservations" ADD COLUMN "migration_import_id" uuid;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_migration_import_fk"
  FOREIGN KEY ("migration_import_id") REFERENCES migration_imports(id) ON DELETE SET NULL;

-- §5.1 — seed the 4 base setup steps when a restaurant is created.
-- (first_campaigns is Pro-only; seeded app-side.) Idempotent via ON CONFLICT.
CREATE OR REPLACE FUNCTION fn_seed_setup_progress() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO setup_progress (organization_id, restaurant_id, step_key, status)
  SELECT NEW.organization_id, NEW.id, k::setup_step_key, 'not_started'
  FROM unnest(ARRAY['migration', 'page_and_photos', 'staff_training', 'parallel_run']) AS k
  ON CONFLICT (organization_id, restaurant_id, step_key) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_seed_setup_progress AFTER INSERT ON restaurants
  FOR EACH ROW EXECUTE FUNCTION fn_seed_setup_progress();

-- RLS: org members read; org admins write; Tavli admin via is_admin() escape hatch.
ALTER TABLE "setup_progress" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "setup_progress_member_select" ON "setup_progress" FOR SELECT USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members" WHERE "user_id" = auth.uid() AND "is_active" = true)
  OR public.is_admin());
CREATE POLICY "setup_progress_admin_write" ON "setup_progress" FOR ALL USING (
  "organization_id" IN (SELECT "organization_id" FROM "organization_members" WHERE "user_id" = auth.uid() AND "is_active" = true AND "role" IN ('owner','admin'))
  OR public.is_admin());

ALTER TABLE "migration_imports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "migration_imports_member_select" ON "migration_imports" FOR SELECT USING (
  "restaurant_id" IN (SELECT r."id" FROM "restaurants" r JOIN "organization_members" m ON m."organization_id" = r."organization_id"
    WHERE m."user_id" = auth.uid() AND m."is_active" = true)
  OR public.is_admin());
