-- §05 §3.1-3.3 — five translation tables for trilingual content.

CREATE TABLE "restaurant_translations" (
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "locale" char(2) NOT NULL CHECK (locale IN ('ro', 'en', 'de')),
  "name" varchar(200),
  "tagline" varchar(300),
  "description_short" text,
  "description_long" text,
  "hero_subtitle" varchar(200),
  "chef_bio" text,
  "ambience" text,
  "dress_code" text,
  "parking_note" text,
  "meta_title" varchar(200),
  "meta_description" varchar(300),
  "og_title" varchar(200),
  "og_description" varchar(300),
  "authored_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "reviewed_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, locale)
);
CREATE INDEX "restaurant_translations_reviewed" ON "restaurant_translations" (restaurant_id, locale) WHERE reviewed_at IS NOT NULL;

CREATE TABLE "menu_translations" (
  "restaurant_id" uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  "locale" char(2) NOT NULL CHECK (locale IN ('ro', 'en', 'de')),
  "hero_note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurant_id, locale)
);

CREATE TABLE "menu_section_translations" (
  "section_id" uuid NOT NULL REFERENCES menu_sections(id) ON DELETE CASCADE,
  "locale" char(2) NOT NULL CHECK (locale IN ('ro', 'en', 'de')),
  "name" varchar(200),
  "intro" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (section_id, locale)
);

CREATE TABLE "menu_item_translations" (
  "item_id" uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  "locale" char(2) NOT NULL CHECK (locale IN ('ro', 'en', 'de')),
  "name" varchar(200),
  "description" text,
  "alt_text" varchar(300),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, locale)
);

CREATE TABLE "restaurant_photo_translations" (
  "photo_id" uuid NOT NULL REFERENCES restaurant_photos(id) ON DELETE CASCADE,
  "locale" char(2) NOT NULL CHECK (locale IN ('ro', 'en', 'de')),
  "alt_text" varchar(300) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (photo_id, locale)
);

-- RLS: public read for translations of live restaurants; admin/staff write.
ALTER TABLE "restaurant_translations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_translations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_section_translations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_item_translations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurant_photo_translations" ENABLE ROW LEVEL SECURITY;

-- For v1 ship admin-only read; venue-page renderer uses service-role.
CREATE POLICY "restaurant_translations_admin_read" ON "restaurant_translations" FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "menu_translations_admin_read" ON "menu_translations" FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "menu_section_translations_admin_read" ON "menu_section_translations" FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "menu_item_translations_admin_read" ON "menu_item_translations" FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE POLICY "restaurant_photo_translations_admin_read" ON "restaurant_photo_translations" FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
