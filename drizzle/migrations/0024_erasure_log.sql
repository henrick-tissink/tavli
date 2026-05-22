-- foundations §15a.1 — Wave 3 sub-unit C backfill.
-- Append-only erasure log written by `pseudonymiseDiner` and other
-- GDPR-erasure helpers. Service-role writes only (no INSERT/UPDATE/DELETE
-- policies). Admins read all rows; org owners read their org's rows.

BEGIN;

CREATE TABLE erasure_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type varchar(40) NOT NULL,  -- 'diner' | 'user' | 'reservation' | etc.
  subject_id uuid NOT NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  reason varchar(80) NOT NULL,        -- 'dsar_erasure' | 'manual_pseudonymise' | 'auto_purge_pseudonymised' | etc.
  redacted_columns text[] NOT NULL DEFAULT '{}',
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  impersonator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX erasure_log_subject ON erasure_log(subject_type, subject_id);
CREATE INDEX erasure_log_actor ON erasure_log(actor_user_id, created_at DESC);
CREATE INDEX erasure_log_created ON erasure_log(created_at DESC);

ALTER TABLE erasure_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY erasure_log_admin_all ON erasure_log
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY erasure_log_org_owner_select ON erasure_log
  FOR SELECT
  USING (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = erasure_log.organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND om.role = 'owner'
  ));

-- No INSERT/UPDATE/DELETE policies — service-role writes only.

COMMIT;
