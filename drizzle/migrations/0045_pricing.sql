-- §15 — Pricing page substrate (Wave 8 sub-unit P1).
-- currency_reference_rates (BNR daily EUR/RON + admin override) + prospect_waitlist.

CREATE TABLE "currency_reference_rates" (
  "source" varchar(20) NOT NULL,
  "effective_date" date NOT NULL,
  "rate" numeric(10, 6) NOT NULL,
  "fetched_at" timestamptz NOT NULL DEFAULT now(),
  "fetched_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "override_expires_at" timestamptz,
  PRIMARY KEY ("source", "effective_date"),
  CONSTRAINT "chk_admin_manual_has_owner" CHECK (
    "source" <> 'admin_manual' OR ("fetched_by_user_id" IS NOT NULL AND "override_expires_at" IS NOT NULL)
  )
);
-- Public read (pricing page is unauthenticated); writes are service-role only.
ALTER TABLE "currency_reference_rates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "currency_reference_rates_public_read" ON "currency_reference_rates" FOR SELECT USING (true);

CREATE TABLE "prospect_waitlist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(255) NOT NULL,
  "organization_name_hint" varchar(200),
  "city_id" uuid REFERENCES cities(id) ON DELETE SET NULL,
  "notes" text,
  "source" varchar(40) NOT NULL DEFAULT 'pricing_page',
  "source_locale" char(2) NOT NULL,
  "source_ip" inet,
  "invited_at" timestamptz,
  "invited_by_user_id" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "invitation_id" uuid REFERENCES invitations(id) ON DELETE SET NULL,
  "joined_at" timestamptz NOT NULL DEFAULT now(),
  "redacted_at" timestamptz
);
CREATE UNIQUE INDEX "prospect_waitlist_email_unique" ON "prospect_waitlist" (lower(email))
  WHERE "invited_at" IS NULL AND "redacted_at" IS NULL;
-- Read is Tavli-admin only; insert via the service-role join-waitlist action.
ALTER TABLE "prospect_waitlist" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prospect_waitlist_admin_read" ON "prospect_waitlist" FOR SELECT USING (public.is_admin());
