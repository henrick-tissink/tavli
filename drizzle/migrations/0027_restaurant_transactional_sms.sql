-- §04 §6.2 — Per-restaurant gate for transactional SMS sends.
-- Off by default; partners opt in once SMS is configured + their copy is approved.

BEGIN;

ALTER TABLE restaurants
  ADD COLUMN transactional_sms_enabled boolean NOT NULL DEFAULT false;

COMMIT;
