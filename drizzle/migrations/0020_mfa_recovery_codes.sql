-- §01 §5a.2 phase 2 — TOTP recovery codes table.
-- One row per code; codes are sha-256 hashed; users can SELECT their own.

BEGIN;

CREATE TABLE mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash varchar(64) NOT NULL UNIQUE,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mfa_recovery_codes_user_active
  ON mfa_recovery_codes(user_id, consumed_at);

ALTER TABLE mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- §3.7 RLS pattern: narrow SELECT for self only. Writes happen via service-role.
CREATE POLICY mfa_recovery_codes_select_self ON mfa_recovery_codes
  FOR SELECT
  USING (user_id = auth.uid());

COMMIT;
