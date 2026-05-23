-- 0032_retention_policies.sql
-- §13 §4.3 — declarative data retention. The nightly purge job iterates these
-- rows; future-wave tables sit as forward-declared policies that the job skips
-- silently until their tables ship.

CREATE TABLE "retention_policies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope_table" varchar(80) NOT NULL UNIQUE,
  "retention_period_days" integer NOT NULL,
  "action_on_expiry" varchar(20) NOT NULL,
  "applies_to_column" varchar(60) NOT NULL DEFAULT 'created_at',
  "exception_predicate" jsonb,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_action_on_expiry"
    CHECK ("action_on_expiry" IN ('hard_delete', 'anonymise', 'archive_offline'))
);

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE "retention_policies" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retention_policies_admin_read"
  ON "retention_policies" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid() AND p."role" = 'admin'
  ));

-- No INSERT/UPDATE/DELETE policies — service-role only.

-- ─── Seed (locked policies — see spec §2.1) ────────────────────────────
INSERT INTO "retention_policies" (scope_table, retention_period_days, action_on_expiry, applies_to_column, exception_predicate, notes) VALUES
  ('audit_logs',              2555, 'hard_delete',     'created_at', NULL,
    'RO Codul Fiscal accounting retention (billing events flow here)'),
  ('transactional_email_log',  730, 'hard_delete',     'created_at', NULL,
    'ANPC inspection window'),
  ('diner_pii_access_log',     730, 'hard_delete',     'created_at', NULL,
    'ANPC PII-access defensibility'),
  ('webhook_events',            90, 'hard_delete',     'created_at', NULL,
    'Idempotency log only, not legally significant'),
  ('data_subject_requests',   1825, 'hard_delete',     'created_at', NULL,
    'Demonstrates GDPR compliance history'),
  ('reservation_status_log',  1825, 'hard_delete',     'created_at', NULL,
    'Industry standard for booking history (Wave 4 §08 future)'),
  ('table_status_log',         365, 'hard_delete',     'created_at', NULL,
    'Operational data (Wave 4 §08 future)'),
  ('marketing_consent_audit', 9999, 'hard_delete',     'created_at',
    jsonb_build_object(
      'table', 'marketing_consents',
      'condition', 'active_consent_exists',
      'predicate_sql', 'not exists (select 1 from marketing_consents mc where mc.diner_id = marketing_consent_audit.diner_id and mc.channel = marketing_consent_audit.channel and mc.revoked_at is null)'
    ),
    'GDPR Art 7(1) — indefinite while consent active; 730d post-revocation otherwise (Wave 7 §11)'),
  ('marketing_link_clicks',    365, 'hard_delete',     'created_at', NULL,
    'Pure analytics; rolled into marketing_sends before purge (Wave 7 §11)'),
  ('marketing_sends',         1095, 'anonymise',       'created_at', NULL,
    'PII cleared; analytics shell retained for reporting (Wave 7 §11)'),
  ('billing_audit_log',       2555, 'hard_delete',     'created_at', NULL,
    'RO Codul Fiscal (Wave 5 §12)')
ON CONFLICT (scope_table) DO NOTHING;
