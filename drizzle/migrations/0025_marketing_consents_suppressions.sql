-- foundations §4.7 — Wave 3 sub-unit C backfill.
-- marketing_consents: per-(diner, channel) consent state. Diner cascade-
-- deletes its consents.
-- marketing_suppressions: bounced emails / complained / STOP'd SMS /
-- manual unsubscribes. Case-insensitive unique on (channel, identifier).

BEGIN;

-- One row per (diner, channel). Most recent revoked_at wins.
CREATE TABLE marketing_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diner_id uuid NOT NULL REFERENCES diners(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel varchar(30) NOT NULL,        -- 'email_marketing' | 'sms_marketing' | 'sms_transactional' | 'email_transactional'
  consent_given boolean NOT NULL,
  source varchar(40) NOT NULL,         -- 'booking_widget' | 'partner_portal_capture' | 'import' | 'email_confirmation'
  given_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT marketing_consents_channel_valid CHECK (
    channel IN ('email_marketing', 'sms_marketing', 'sms_transactional', 'email_transactional')
  )
);

CREATE INDEX marketing_consents_diner_channel
  ON marketing_consents(diner_id, channel, given_at DESC);

ALTER TABLE marketing_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketing_consents_admin_all ON marketing_consents
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY marketing_consents_org_member_select ON marketing_consents
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = marketing_consents.organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  ));

-- Suppression list: bounced emails, complained, STOP'd SMS, manual unsubscribes.
CREATE TABLE marketing_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel varchar(20) NOT NULL,        -- 'email' | 'sms'
  identifier varchar(255) NOT NULL,    -- email address or E.164 phone
  source varchar(40) NOT NULL,         -- 'bounce' | 'complaint' | 'sms_stop_keyword' | 'manual_unsubscribe'
  reason text,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_suppressions_channel_valid CHECK (channel IN ('email', 'sms'))
);

CREATE UNIQUE INDEX marketing_suppressions_channel_id_unique
  ON marketing_suppressions(channel, lower(identifier));

ALTER TABLE marketing_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY marketing_suppressions_admin_all ON marketing_suppressions
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Org members can SELECT their own org's suppressions (NULL organization_id = global, admin-only via the policy above)
CREATE POLICY marketing_suppressions_org_member_select ON marketing_suppressions
  FOR SELECT
  USING (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = marketing_suppressions.organization_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  ));

-- INSERT/UPDATE/DELETE: service-role only (webhook handlers + admin tooling).

COMMIT;
