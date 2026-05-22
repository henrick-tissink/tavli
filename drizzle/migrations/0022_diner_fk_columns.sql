-- §03 §4.2/§4.3 — Diner FK on reservations + reviews.
-- Historical rows stay diner_id=NULL; only new post-Wave-3 reservations link.

BEGIN;

ALTER TABLE reservations
  ADD COLUMN diner_id uuid REFERENCES diners(id) ON DELETE SET NULL;
CREATE INDEX reservations_diner ON reservations(diner_id);

ALTER TABLE reviews
  ADD COLUMN diner_id uuid REFERENCES diners(id) ON DELETE SET NULL;
CREATE INDEX reviews_diner ON reviews(diner_id);

COMMIT;
