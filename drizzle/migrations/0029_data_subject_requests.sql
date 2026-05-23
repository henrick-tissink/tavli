-- 0029_data_subject_requests.sql
-- §13 §4.2 — GDPR Articles 15/16/17/20 (access / rectification / erasure / portability) tracking.
--
-- Writes go through src/lib/compliance/dsr-actions.ts (service role). RLS allows
-- Tavli admin reads only; diner-self-read deferred until in-product intake ships.

CREATE TABLE "data_subject_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  "diner_id" uuid REFERENCES "diners"("id") ON DELETE SET NULL,
  "identifier_phone" varchar(20),
  "identifier_email" varchar(255),

  "request_kind" varchar(40) NOT NULL,
  "request_source" varchar(40) NOT NULL,
  "request_body" text,

  "identity_verified" boolean NOT NULL DEFAULT false,
  "identity_verification_method" varchar(60),
  "identity_verified_at" timestamptz,
  "identity_verified_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  "status" varchar(20) NOT NULL DEFAULT 'received',
  "rejection_reason" text,
  "completed_at" timestamptz,

  "legal_deadline_at" timestamptz NOT NULL,

  "approved_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "approved_at" timestamptz,

  "deadline_extension_days" smallint NOT NULL DEFAULT 0,
  "deadline_extension_reason" text,
  "deadline_extended_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "deadline_extended_at" timestamptz,

  "export_storage_path" text,
  "export_signed_url_expires_at" timestamptz,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "chk_dsr_deadline_extension_cap"
    CHECK ("deadline_extension_days" BETWEEN 0 AND 14),
  CONSTRAINT "chk_dsr_deadline_extension_reason"
    CHECK (
      ("deadline_extension_days" = 0 AND "deadline_extension_reason" IS NULL)
      OR ("deadline_extension_days" > 0 AND "deadline_extension_reason" IS NOT NULL AND "deadline_extended_by_user_id" IS NOT NULL)
    )
);

CREATE INDEX "data_subject_requests_status"
  ON "data_subject_requests" ("status", "legal_deadline_at")
  WHERE "status" IN ('received', 'in_progress');

CREATE INDEX "data_subject_requests_diner"
  ON "data_subject_requests" ("diner_id")
  WHERE "diner_id" IS NOT NULL;

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE "data_subject_requests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dsr_admin_read" ON "data_subject_requests" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid() AND p."role" = 'admin'
  ));

-- No INSERT/UPDATE/DELETE policies — service-role only.
