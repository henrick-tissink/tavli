-- 0071_meeting_standing_erasure
-- meeting_space_bookings (Corporate Phase 2, 0066) and standing_reservations
-- (Corporate Phase 4, 0067) both capture guest PII (guest_name / guest_email /
-- guest_phone + free-text notes) but shipped with NO erasure path and no
-- retention — the same shipped-stub gap 0052 closed for walkin_queue. Neither
-- table carries a diner_id, so their DSR handlers match on the erased subject's
-- captured contact identifiers (guest_email / guest_phone).
--
-- 1. redacted_at column so each DSR handler can stamp pseudonymised rows and the
--    verification sweep can confirm the redaction (mirrors the other PII tables).
-- 2. retention policies — corporate booking records; hard-delete after 5y,
--    matching the event_requests (0047) corporate-intake sibling.
-- Additive only.

ALTER TABLE "meeting_space_bookings" ADD COLUMN IF NOT EXISTS "redacted_at" timestamptz;
ALTER TABLE "standing_reservations" ADD COLUMN IF NOT EXISTS "redacted_at" timestamptz;

INSERT INTO "retention_policies" (scope_table, retention_period_days, action_on_expiry, applies_to_column, exception_predicate, notes) VALUES
  ('meeting_space_bookings', 1825, 'hard_delete', 'created_at', NULL,
    'Corporate Phase 2 — GDPR minimisation of meeting-room booking guest contact (guest_name + guest_email + guest_phone); 5y matches event_requests corporate-intake retention'),
  ('standing_reservations', 1825, 'hard_delete', 'created_at', NULL,
    'Corporate Phase 4 — GDPR minimisation of standing-reservation guest contact (guest_name + guest_phone + guest_email); 5y matches event_requests corporate-intake retention')
ON CONFLICT (scope_table) DO NOTHING;
