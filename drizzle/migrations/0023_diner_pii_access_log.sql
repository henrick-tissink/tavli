-- §03 §5.5 / §8.1 — Audit log of PII reveals for diner records.
-- One row per (diner, field, actor) for every unmasked read.
-- INSERTs are service-role only via the revealPiiBatch helper.

BEGIN;

CREATE TABLE diner_pii_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diner_id uuid NOT NULL REFERENCES diners(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  accessed_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  accessed_field varchar(40) NOT NULL,
  access_kind varchar(20) NOT NULL,
  surface varchar(40),
  context_reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  accessed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX diner_pii_access_log_diner ON diner_pii_access_log(diner_id, accessed_at DESC);
CREATE INDEX diner_pii_access_log_actor ON diner_pii_access_log(accessed_by_user_id, accessed_at DESC);

ALTER TABLE diner_pii_access_log ENABLE ROW LEVEL SECURITY;

-- Admin reads all
CREATE POLICY diner_pii_access_log_admin_all ON diner_pii_access_log
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Org members read their org's logs
CREATE POLICY diner_pii_access_log_org_member_select ON diner_pii_access_log
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = diner_pii_access_log.organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  ));

-- No INSERT/UPDATE/DELETE policies — service-role only (revealPiiBatch helper uses dbAdmin)

COMMIT;
