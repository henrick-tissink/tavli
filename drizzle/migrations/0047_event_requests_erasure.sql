-- 0047_event_requests_erasure.sql
-- audit #12 — event_requests held heavy guest PII (name/email/phone, dietary
-- & additional notes) with no erasure marker and no retention policy, and the
-- diner-keyed cascade never reached it.
--
-- 1. Add the redacted_at erasure marker (set by handleEventRequests on a DSR).
-- 2. Add a wholesale time-based retention purge (hard_delete @ 1825 days /
--    5 years — RO contractual + fiscal defensibility window, matching the
--    data_subject_requests / reservation_status_log precedent).

ALTER TABLE "event_requests" ADD COLUMN IF NOT EXISTS "redacted_at" timestamptz;

INSERT INTO "retention_policies" (scope_table, retention_period_days, action_on_expiry, applies_to_column, exception_predicate, notes) VALUES
  ('event_requests', 1825, 'hard_delete', 'created_at', NULL,
    'audit #12 — corporate event intake PII; 5y contractual/fiscal window')
ON CONFLICT (scope_table) DO NOTHING;
