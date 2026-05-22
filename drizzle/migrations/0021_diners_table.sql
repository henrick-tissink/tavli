-- §03 §4.1 — diners table + acquisition-source enum + §3.7 RLS pattern (admin-all + org-member-select + org-admin-write + venue-staff-select-via-reservation + update-notes-via-reservation) + partial-unique indices that survive pseudonymisation.

BEGIN;

CREATE TYPE diner_acquisition_source AS ENUM (
  'widget', 'venue_page', 'editorial', 'corporate',
  'walk_in', 'manual', 'import', 'email_campaign', 'api'
);

CREATE TABLE diners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone varchar(20),
  phone_raw varchar(40),
  email varchar(255),
  full_name varchar(200),
  locale char(2) NOT NULL DEFAULT 'ro',
  allergies text[] NOT NULL DEFAULT '{}',
  occasion_tags text[] NOT NULL DEFAULT '{}',
  seating_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  dietary_preferences text[] NOT NULL DEFAULT '{}',
  birthday_date date,
  anniversary_date date,
  internal_notes text,
  acquisition_source diner_acquisition_source,
  acquisition_restaurant_id uuid REFERENCES restaurants(id) ON DELETE SET NULL,
  visit_count integer NOT NULL DEFAULT 0,
  covers_total integer NOT NULL DEFAULT 0,
  first_visited_at timestamptz,
  last_visited_at timestamptz,
  frequency_bucket varchar(20) NOT NULL DEFAULT 'first_timer',
  typical_party_size_min integer,
  typical_party_size_max integer,
  no_show_count integer NOT NULL DEFAULT 0,
  cancellation_count integer NOT NULL DEFAULT 0,
  redacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diners_identity_required CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- Partial uniques. `redacted_at IS NULL` keeps pseudonymised rows from blocking new diners with the same contact.
CREATE UNIQUE INDEX diners_org_phone_unique
  ON diners(organization_id, phone)
  WHERE phone IS NOT NULL AND redacted_at IS NULL;

CREATE UNIQUE INDEX diners_org_email_unique
  ON diners(organization_id, lower(email))
  WHERE email IS NOT NULL AND phone IS NULL AND redacted_at IS NULL;

CREATE INDEX diners_org_full_name ON diners(organization_id, lower(full_name));
CREATE INDEX diners_org_phone ON diners(organization_id, phone);
CREATE INDEX diners_frequency
  ON diners(organization_id, frequency_bucket)
  WHERE redacted_at IS NULL;
CREATE INDEX diners_last_visited
  ON diners(organization_id, last_visited_at DESC)
  WHERE redacted_at IS NULL;

ALTER TABLE diners ENABLE ROW LEVEL SECURITY;

CREATE POLICY diners_admin_all ON diners
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY diners_org_member_select ON diners
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = diners.organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  ));

CREATE POLICY diners_org_admin_write ON diners
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = diners.organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND om.role IN ('owner', 'admin')
  ));

CREATE POLICY diners_venue_staff_select ON diners
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM restaurant_staff rs
    JOIN restaurants r ON r.id = rs.restaurant_id
    WHERE rs.user_id = auth.uid()
      AND rs.is_active = true
      AND r.organization_id = diners.organization_id
      AND EXISTS (
        SELECT 1 FROM reservations res
        WHERE res.restaurant_id = rs.restaurant_id
          AND res.diner_id = diners.id
      )
  ));

CREATE POLICY diners_venue_staff_update_notes ON diners
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM restaurant_staff rs
    JOIN restaurants r ON r.id = rs.restaurant_id
    WHERE rs.user_id = auth.uid()
      AND rs.is_active = true
      AND r.organization_id = diners.organization_id
      AND EXISTS (
        SELECT 1 FROM reservations res
        WHERE res.restaurant_id = rs.restaurant_id
          AND res.diner_id = diners.id
      )
  ));

COMMIT;
