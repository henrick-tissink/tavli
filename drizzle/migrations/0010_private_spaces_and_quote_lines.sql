-- 0010_private_spaces_and_quote_lines.sql
-- Phase 1.5: lightweight rooms catalogue + quote breakdown.

CREATE TABLE "restaurant_private_spaces" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurant_id"  UUID NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "name"           VARCHAR(120) NOT NULL,
  "description"    TEXT,
  "capacity_min"   INTEGER NOT NULL,
  "capacity_max"   INTEGER NOT NULL,
  "photo_storage_path" TEXT,
  "sort_order"     INTEGER NOT NULL DEFAULT 0,
  "is_active"      BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT "rps_capacity_order" CHECK ("capacity_min" <= "capacity_max")
);

CREATE INDEX "rps_restaurant_active_idx"
  ON "restaurant_private_spaces" ("restaurant_id")
  WHERE "is_active" = TRUE;

ALTER TABLE "event_requests"
  ADD COLUMN "private_space_id" UUID REFERENCES "restaurant_private_spaces"("id") ON DELETE SET NULL;

CREATE TABLE "event_request_quote_line_items" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "event_request_id" UUID NOT NULL REFERENCES "event_requests"("id") ON DELETE CASCADE,
  "label"            VARCHAR(160) NOT NULL,
  "amount_cents"     INTEGER NOT NULL,
  "sort_order"       INTEGER NOT NULL DEFAULT 0,
  "created_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX "erqli_event_request_idx"
  ON "event_request_quote_line_items" ("event_request_id", "sort_order");

ALTER TABLE "restaurant_private_spaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "event_request_quote_line_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "private_spaces_public_read" ON "restaurant_private_spaces" FOR SELECT
  USING ("is_active" = TRUE AND EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "restaurant_private_spaces"."restaurant_id"
      AND r."status" = 'live'
  ));

CREATE POLICY "private_spaces_owner_write" ON "restaurant_private_spaces" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "restaurant_private_spaces"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "restaurants" r
    WHERE r."id" = "restaurant_private_spaces"."restaurant_id"
      AND r."owner_user_id" = auth.uid()
  ));

CREATE POLICY "quote_lines_visible_with_request" ON "event_request_quote_line_items" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "event_requests" er
    WHERE er."id" = "event_request_quote_line_items"."event_request_id"
  ));

CREATE POLICY "quote_lines_owner_write" ON "event_request_quote_line_items" FOR ALL
  USING (EXISTS (
    SELECT 1 FROM "event_requests" er
    JOIN "restaurants" r ON r."id" = er."restaurant_id"
    WHERE er."id" = "event_request_quote_line_items"."event_request_id"
      AND r."owner_user_id" = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "event_requests" er
    JOIN "restaurants" r ON r."id" = er."restaurant_id"
    WHERE er."id" = "event_request_quote_line_items"."event_request_id"
      AND r."owner_user_id" = auth.uid()
  ));

CREATE TRIGGER "trg_restaurant_private_spaces_touch_updated_at"
  BEFORE UPDATE ON "restaurant_private_spaces"
  FOR EACH ROW EXECUTE FUNCTION "fn_touch_updated_at"();
