-- §03 §4.2/§4.3 — Diner FK on reservations + reviews.
-- Historical rows stay diner_id=NULL; only new post-Wave-3 reservations link.

BEGIN;

ALTER TABLE reservations
  ADD COLUMN diner_id uuid REFERENCES diners(id) ON DELETE SET NULL;
CREATE INDEX reservations_diner ON reservations(diner_id);

ALTER TABLE reviews
  ADD COLUMN diner_id uuid REFERENCES diners(id) ON DELETE SET NULL;
CREATE INDEX reviews_diner ON reviews(diner_id);

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
