-- §08 — Table management data model + state machine.
-- 3 enums + 5 tables + reservations columns + denorm-sync trigger.

CREATE TYPE "table_status" AS ENUM ('free', 'booked', 'seated', 'paying', 'dirty', 'combined', 'blocked');
CREATE TYPE "table_shape" AS ENUM ('round', 'square', 'rect_2x4', 'rect_2x6', 'rect_2x8', 'banquette', 'bar_stool', 'high_top', 'patio');
CREATE TYPE "walkin_queue_status" AS ENUM ('waiting', 'called', 'seated', 'left', 'no_show');

-- ─── restaurant_table_sections ──────────────────────────────────────────
CREATE TABLE "restaurant_table_sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "name" varchar(60) NOT NULL,
  "color" varchar(7),
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "restaurant_table_sections_restaurant" ON "restaurant_table_sections" ("restaurant_id", "sort_order");

-- ─── restaurant_tables ──────────────────────────────────────────────────
CREATE TABLE "restaurant_tables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "section_id" uuid REFERENCES restaurant_table_sections(id) ON DELETE SET NULL,
  "label" varchar(20) NOT NULL,
  "description" text,
  "capacity_min" smallint NOT NULL,
  "capacity_max" smallint NOT NULL,
  "capacity_typical" smallint,
  "shape" table_shape NOT NULL,
  "position_x" integer NOT NULL,
  "position_y" integer NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "rotation_degrees" smallint NOT NULL DEFAULT 0,
  "current_status" table_status NOT NULL DEFAULT 'free',
  "current_status_since" timestamptz NOT NULL DEFAULT now(),
  "current_reservation_id" uuid REFERENCES reservations(id) ON DELETE SET NULL,
  "current_combination_id" uuid,  -- FK added after table_combinations exists
  "current_server_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "is_bookable_online" boolean NOT NULL DEFAULT true,
  "is_pro_only" boolean NOT NULL DEFAULT false,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "table_capacity_check" CHECK (capacity_max >= capacity_min AND capacity_min >= 1)
);
CREATE UNIQUE INDEX "restaurant_tables_label_active" ON "restaurant_tables" ("restaurant_id", "label") WHERE "archived_at" IS NULL;
CREATE INDEX "restaurant_tables_restaurant" ON "restaurant_tables" ("restaurant_id") WHERE "archived_at" IS NULL;
CREATE INDEX "restaurant_tables_section" ON "restaurant_tables" ("section_id") WHERE "archived_at" IS NULL;
CREATE INDEX "restaurant_tables_current_reservation" ON "restaurant_tables" ("current_reservation_id") WHERE "current_reservation_id" IS NOT NULL;

-- ─── table_status_log ──────────────────────────────────────────────────
CREATE TABLE "table_status_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "table_id" uuid NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "from_status" table_status,
  "to_status" table_status NOT NULL,
  "reservation_id" uuid REFERENCES reservations(id) ON DELETE SET NULL,
  "combination_id" uuid,
  "changed_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "changed_at" timestamptz NOT NULL DEFAULT now(),
  "notes" text,
  "duration_seconds_in_from_status" integer
);
CREATE INDEX "table_status_log_table" ON "table_status_log" ("table_id", "changed_at" DESC);
CREATE INDEX "table_status_log_restaurant_seated" ON "table_status_log" ("restaurant_id", "changed_at" DESC) WHERE "to_status" = 'seated';

-- ─── Denorm sync trigger (per §08 §4.4) ────────────────────────────────
CREATE OR REPLACE FUNCTION table_status_log_sync_denorm() RETURNS trigger AS $$
BEGIN
  UPDATE restaurant_tables
     SET current_status = NEW.to_status,
         current_status_since = NEW.changed_at,
         current_reservation_id = CASE WHEN NEW.to_status IN ('booked', 'seated', 'paying') THEN NEW.reservation_id ELSE NULL END,
         current_combination_id = CASE WHEN NEW.to_status = 'combined' THEN NEW.combination_id ELSE NULL END,
         updated_at = now()
   WHERE id = NEW.table_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_table_status_log_sync_denorm"
  AFTER INSERT ON table_status_log
  FOR EACH ROW EXECUTE FUNCTION table_status_log_sync_denorm();

-- ─── table_combinations ────────────────────────────────────────────────
CREATE TABLE "table_combinations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "table_ids" uuid[] NOT NULL,
  "primary_table_id" uuid NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  "status" table_status NOT NULL DEFAULT 'booked',
  "status_since" timestamptz NOT NULL DEFAULT now(),
  "reservation_id" uuid REFERENCES reservations(id) ON DELETE SET NULL,
  "combined_capacity" smallint NOT NULL,
  "created_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "dissolved_at" timestamptz,
  CONSTRAINT "table_combinations_minimum_size" CHECK (array_length(table_ids, 1) >= 2)
);
CREATE INDEX "table_combinations_restaurant_active" ON "table_combinations" ("restaurant_id") WHERE "dissolved_at" IS NULL;

-- ─── Now add the FK constraints requiring table_combinations to exist ─────
ALTER TABLE "restaurant_tables"
  ADD CONSTRAINT "restaurant_tables_combination_fk"
  FOREIGN KEY ("current_combination_id") REFERENCES table_combinations(id) ON DELETE SET NULL;

ALTER TABLE "table_status_log"
  ADD CONSTRAINT "table_status_log_combination_fk"
  FOREIGN KEY ("combination_id") REFERENCES table_combinations(id) ON DELETE SET NULL;

-- ─── walkin_queue ──────────────────────────────────────────────────────
CREATE TABLE "walkin_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "guest_name" varchar(120) NOT NULL,
  "guest_phone" varchar(20),
  "party_size" smallint NOT NULL,
  "notes" text,
  "status" walkin_queue_status NOT NULL DEFAULT 'waiting',
  "position" smallint NOT NULL,
  "estimated_wait_minutes" smallint,
  "added_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "called_at" timestamptz,
  "seated_at" timestamptz,
  "left_at" timestamptz,
  "seated_table_id" uuid REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  "seated_reservation_id" uuid REFERENCES reservations(id) ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "walkin_queue_active" ON "walkin_queue" ("restaurant_id", "position") WHERE "status" IN ('waiting', 'called');

-- ─── reservations modifications ─────────────────────────────────────────
ALTER TABLE "reservations" ADD COLUMN "table_id" uuid REFERENCES restaurant_tables(id) ON DELETE SET NULL;
ALTER TABLE "reservations" ADD COLUMN "combination_id" uuid REFERENCES table_combinations(id) ON DELETE SET NULL;
ALTER TABLE "reservations" ADD COLUMN "auto_assigned" boolean NOT NULL DEFAULT false;
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_or_combination_check"
  CHECK (table_id IS NULL OR combination_id IS NULL);

CREATE INDEX "reservations_table" ON "reservations" ("table_id") WHERE "table_id" IS NOT NULL;
CREATE INDEX "reservations_combination" ON "reservations" ("combination_id") WHERE "combination_id" IS NOT NULL;

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE "restaurant_table_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_tables" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "table_status_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "table_combinations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkin_queue" ENABLE ROW LEVEL SECURITY;

-- Admin-only read policies for v1; venue-staff read policies added in sub-unit G with the floor-plan UI.
CREATE POLICY "restaurant_table_sections_admin_read" ON "restaurant_table_sections" FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "restaurant_tables_admin_read" ON "restaurant_tables" FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "table_status_log_admin_read" ON "table_status_log" FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "table_combinations_admin_read" ON "table_combinations" FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "walkin_queue_admin_read" ON "walkin_queue" FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
