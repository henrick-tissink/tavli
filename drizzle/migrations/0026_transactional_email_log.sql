-- §04 §5.1 — Wave 3 sub-unit E.
-- Unified transactional comms log. Single table with `channel` column
-- ('email' | 'sms') covering both Resend + Twilio sends. Status mutex
-- per channel enforced by CHECK constraint: email rows have
-- email_status populated and sms_status null; sms rows are the
-- mirror. organization_id_at_event is the immutable owning org at
-- send-time (survives organization_id FK nulling).

BEGIN;

CREATE TABLE transactional_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key varchar(60) NOT NULL,
  email varchar(255),
  phone varchar(20),
  diner_id uuid REFERENCES diners(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  organization_id_at_event uuid NOT NULL,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE SET NULL,
  channel varchar(20) NOT NULL,
  locale char(2) NOT NULL,
  subject varchar(300),
  resend_message_id varchar(80),
  twilio_message_sid varchar(80),
  email_status varchar(20),
  sms_status varchar(20),
  status_updated_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  redacted_at timestamptz,
  CONSTRAINT transactional_log_status_per_channel CHECK (
    (channel = 'email' AND email_status IS NOT NULL AND sms_status IS NULL)
    OR (channel = 'sms' AND sms_status IS NOT NULL AND email_status IS NULL)
  ),
  CONSTRAINT transactional_log_channel_valid CHECK (channel IN ('email', 'sms')),
  CONSTRAINT transactional_log_email_status_valid CHECK (
    email_status IS NULL OR email_status IN ('queued', 'sent', 'delivered', 'bounced', 'complained', 'failed')
  ),
  CONSTRAINT transactional_log_sms_status_valid CHECK (
    sms_status IS NULL OR sms_status IN ('queued', 'sent', 'delivered', 'undelivered', 'failed', 'optout')
  )
);

CREATE INDEX transactional_email_log_diner ON transactional_email_log(diner_id, created_at DESC);
CREATE INDEX transactional_email_log_reservation ON transactional_email_log(reservation_id, created_at DESC);
CREATE UNIQUE INDEX transactional_email_log_resend
  ON transactional_email_log(resend_message_id)
  WHERE resend_message_id IS NOT NULL;
CREATE UNIQUE INDEX transactional_email_log_twilio
  ON transactional_email_log(twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL;

ALTER TABLE transactional_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactional_email_log_admin_all ON transactional_email_log
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY transactional_email_log_org_member_select ON transactional_email_log
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = transactional_email_log.organization_id_at_event
      AND om.user_id = auth.uid()
      AND om.is_active = true
  ));

-- INSERT/UPDATE: service-role only (the wrapper + webhook handlers).

COMMIT;
