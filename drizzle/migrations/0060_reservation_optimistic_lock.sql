-- 0060_reservation_optimistic_lock
-- §02 §3.1/§4.5 — optimistic locking + modification metadata for the
-- modify-by-link flow (F14). Every modify takes the client's `version`; the
-- UPDATE is WHERE id = ? AND version = ?, incrementing it — a 0-row result is a
-- concurrent-edit conflict. modified_at/modified_by_user_id record the last
-- modification (distinct from the status-change history in reservation_status_log).
--
-- Additive columns, defaults backfill existing rows to version 0. Safe ahead of code.

ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 0;
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "modified_at" timestamptz;
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "modified_by_user_id" uuid REFERENCES "auth"."users"("id") ON DELETE SET NULL;
