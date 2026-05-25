-- 0059_reservation_status_log
-- §02 §3.3 — append-only history of reservation status transitions. Every action
-- that changes reservations.status writes a row here (in addition to audit_logs),
-- feeding the §5.4 detail-sheet timeline + §07 covers/no-show/cancellation reports.
-- Statuses are varchar (decoupled from the reservation_status enum on purpose, so
-- the log tolerates future status values without a type migration).
--
-- Additive table only. Safe to apply ahead of code.

CREATE TABLE IF NOT EXISTS "reservation_status_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "reservation_id" uuid NOT NULL REFERENCES "reservations"("id") ON DELETE CASCADE,
  "restaurant_id" uuid NOT NULL REFERENCES "restaurants"("id") ON DELETE CASCADE,
  "from_status" varchar(20),
  "to_status" varchar(20) NOT NULL,
  "changed_by_user_id" uuid REFERENCES "auth"."users"("id") ON DELETE SET NULL,
  "reason" varchar(60),
  "changed_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "reservation_status_log_reservation" ON "reservation_status_log" ("reservation_id", "changed_at");
CREATE INDEX IF NOT EXISTS "reservation_status_log_restaurant" ON "reservation_status_log" ("restaurant_id", "changed_at");

ALTER TABLE "reservation_status_log" ENABLE ROW LEVEL SECURITY;
