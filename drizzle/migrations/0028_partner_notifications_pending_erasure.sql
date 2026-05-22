-- Build-order line 91 + §13 two-phase erasure cascade leaf.
-- Wave 3 ships the timestamp columns; Wave 4 §13 orchestrator fills them in
-- and nulls PII when the cascade runs.

BEGIN;

ALTER TABLE partner_notifications
  ADD COLUMN pending_erasure_at timestamptz,
  ADD COLUMN redacted_at timestamptz;

COMMIT;
