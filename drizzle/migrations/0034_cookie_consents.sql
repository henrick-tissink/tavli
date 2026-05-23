-- Wave 4 sub-unit D §13 §4.5 — cookie_consents table
-- Service-role only. No RLS policies — bare minimum (ENABLE RLS blocks anon/authenticated).

CREATE TABLE "cookie_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "visitor_session_id" uuid NOT NULL,
  "diner_id" uuid REFERENCES diners(id) ON DELETE SET NULL,
  "organization_id" uuid REFERENCES organizations(id) ON DELETE SET NULL,
  "essential" boolean NOT NULL DEFAULT true,
  "analytics" boolean NOT NULL DEFAULT false,
  "marketing_tracking" boolean NOT NULL DEFAULT false,
  "granted_ip" inet,
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz
);

CREATE INDEX "cookie_consents_session" ON "cookie_consents" ("visitor_session_id", "granted_at" DESC);

ALTER TABLE "cookie_consents" ENABLE ROW LEVEL SECURITY;
