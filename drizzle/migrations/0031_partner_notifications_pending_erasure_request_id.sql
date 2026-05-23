-- 0031_partner_notifications_pending_erasure_request_id.sql
-- §13 §6.3 step (h) phase 2 needs to know which DSR triggered each phase 1 mark
-- so a phase 2 retry can target only its own marked rows.

ALTER TABLE "partner_notifications"
  ADD COLUMN "pending_erasure_request_id" uuid NULL
  REFERENCES "data_subject_requests"("id") ON DELETE SET NULL;

CREATE INDEX "partner_notifications_pending_erasure_request_idx"
  ON "partner_notifications" ("pending_erasure_request_id")
  WHERE "pending_erasure_request_id" IS NOT NULL;
