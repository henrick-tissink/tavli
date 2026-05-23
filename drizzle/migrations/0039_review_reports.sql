-- §06 §3.3 Wave 4 sub-unit K.1 — DSA notice-and-action: review_reports table.
--
-- Allows any visitor (anon-allowed POST endpoint with rate limiting) to flag a
-- review. Tavli admins can uphold (hiding the review) or dismiss the report.
-- Admin-only read policy for v1; partner-side read added when partner review UI ships.

CREATE TABLE "review_reports" (
  "id"                   uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_id"            uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  "reporter_user_id"     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "reporter_ip"          inet,
  "reason"               varchar(60) NOT NULL,
  "details"              text,
  "status"               varchar(20) NOT NULL DEFAULT 'pending',
  "resolved_by_user_id"  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "resolved_at"          timestamptz,
  "created_at"           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_review_reports_reason"
    CHECK (reason IN ('inappropriate', 'fake', 'spam', 'off_topic', 'personal_attack', 'gdpr_takedown')),
  CONSTRAINT "chk_review_reports_status"
    CHECK (status IN ('pending', 'upheld', 'dismissed'))
);

CREATE INDEX "review_reports_review" ON "review_reports" ("review_id");
CREATE INDEX "review_reports_status" ON "review_reports" ("status") WHERE "status" = 'pending';

ALTER TABLE "review_reports" ENABLE ROW LEVEL SECURITY;

-- Admin read for v1; org-member read added when partner-side review UI ships.
CREATE POLICY "review_reports_admin_read" ON "review_reports" FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
