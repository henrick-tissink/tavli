-- 0030_redacted_at_columns_backfill.sql
-- Foundations §15a.1 — every PII-bearing table has a redacted_at timestamptz column.
-- Wave 3 added it to diners + partner_notifications + transactional_email_log;
-- this migration backfills the three remaining tables.

ALTER TABLE "audit_logs"   ADD COLUMN "redacted_at" timestamptz NULL;
ALTER TABLE "reservations" ADD COLUMN "redacted_at" timestamptz NULL;
ALTER TABLE "reviews"      ADD COLUMN "redacted_at" timestamptz NULL;

CREATE INDEX "audit_logs_redacted_at_idx"
  ON "audit_logs" ("redacted_at") WHERE "redacted_at" IS NOT NULL;

CREATE INDEX "reservations_redacted_at_idx"
  ON "reservations" ("redacted_at") WHERE "redacted_at" IS NOT NULL;

CREATE INDEX "reviews_redacted_at_idx"
  ON "reviews" ("redacted_at") WHERE "redacted_at" IS NOT NULL;
