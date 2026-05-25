-- 0055_reservation_reminder_sent_at
-- §02 §6 — the 24-hour pre-arrival reminder (promised on the pricing page,
-- previously unbuilt). reminder_sent_at is the double-fire guard: the reminder
-- sweep claims a reservation by setting this in one UPDATE before sending, and
-- releases it (back to NULL) if the send fails so a later sweep retries.
--
-- Additive column + a partial index for the hourly sweep's predicate. Safe to
-- apply ahead of code.

ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "reminder_sent_at" timestamptz;

CREATE INDEX IF NOT EXISTS "reservations_reminder_pending"
  ON "reservations" (reservation_date)
  WHERE reminder_sent_at IS NULL AND status = 'confirmed';
