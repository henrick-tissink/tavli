-- 0052_walkin_queue_erasure
-- Phase B1 — walkin_queue holds guest_name + guest_phone (PII) but had NO
-- erasure path (it was a shipped:false registry stub) and no retention.
--
-- 1. redacted_at column so the DSR handler can stamp pseudonymised rows and the
--    verification sweep can confirm the redaction (mirrors the other PII tables).
-- 2. retention policy — walk-in queue entries are ephemeral intra-day records;
--    hard-delete rows older than 90 days (no operational value past that, and
--    GDPR storage-minimisation of the guest contact). Mirrors prospect_waitlist.
-- Additive only.

ALTER TABLE "walkin_queue" ADD COLUMN IF NOT EXISTS "redacted_at" timestamptz;

INSERT INTO "retention_policies" (scope_table, retention_period_days, action_on_expiry, applies_to_column, exception_predicate, notes) VALUES
  ('walkin_queue', 90, 'hard_delete', 'created_at', NULL,
    'B1 — GDPR minimisation of walk-in guest contact (guest_name + guest_phone); ephemeral intra-day records')
ON CONFLICT (scope_table) DO NOTHING;
