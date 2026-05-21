-- 0018_staff_invitations.sql
-- §01 §3.5 — staff_invitations table for org-level and venue-level
-- invitation flows. Schema-only; the server-action surface
-- (invite/claim/revoke/resend + email) lives in a follow-up unit per
-- §01 §13 step 10.
--
-- Separate from the existing `invitations` table (which is specifically
-- for restaurant-ownership claim during onboarding). Staff invitations
-- cover both org-level and venue-level role grants.
--
-- token_hash uses varchar(64) (hex-encoded sha256) matching the existing
-- `invitations` table convention, not the spec's bytea — uniform with the
-- codebase.
--
-- RLS pattern matches the architecture doc §3.7 (post-sub-unit-A
-- revision): inviter SELECT (rows they sent), invitee SELECT (by
-- email match against their profile), Tavli admin SELECT for support.
-- No mutation policies — writes through the future service-role
-- helpers in src/lib/identity/* per §01 §6.

BEGIN;

-- ─── Enums ──────────────────────────────────────────────────────────────
CREATE TYPE "public"."staff_invitation_kind" AS ENUM ('org', 'restaurant');
CREATE TYPE "public"."staff_invitation_status" AS ENUM ('pending', 'claimed', 'expired', 'revoked');

-- ─── Table ──────────────────────────────────────────────────────────────
CREATE TABLE "staff_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "staff_invitation_kind" NOT NULL,
  "organization_id" uuid,
  "restaurant_id" uuid,
  "email" varchar(255) NOT NULL,
  "role" varchar(32) NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "status" "staff_invitation_status" DEFAULT 'pending' NOT NULL,
  "claimed_at" timestamp with time zone,
  "claimed_by_user_id" uuid,
  "invited_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,

  CONSTRAINT "staff_invitations_token_hash_unique" UNIQUE ("token_hash"),

  CONSTRAINT "staff_invitations_target_check" CHECK (
    ("kind" = 'org' AND "organization_id" IS NOT NULL AND "restaurant_id" IS NULL)
    OR
    ("kind" = 'restaurant' AND "restaurant_id" IS NOT NULL AND "organization_id" IS NULL)
  )
);

-- ─── FK constraints ─────────────────────────────────────────────────────
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_restaurant_id_restaurants_id_fk"
  FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE CASCADE;

ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_claimed_by_user_id_users_id_fk"
  FOREIGN KEY ("claimed_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;

ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_user_id_users_id_fk"
  FOREIGN KEY ("invited_by_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

-- ─── Indexes (partial, scoped to pending rows) ──────────────────────────
CREATE INDEX "staff_invitations_email_status_idx" ON "staff_invitations" USING btree ("email","status")
  WHERE "status" = 'pending';

CREATE INDEX "staff_invitations_org_idx" ON "staff_invitations" USING btree ("organization_id")
  WHERE "status" = 'pending';

CREATE INDEX "staff_invitations_restaurant_idx" ON "staff_invitations" USING btree ("restaurant_id")
  WHERE "status" = 'pending';

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE "staff_invitations" ENABLE ROW LEVEL SECURITY;

-- Inviters can see invitations they sent.
CREATE POLICY "staff_invitations_inviter_select" ON "staff_invitations" FOR SELECT
  USING ("invited_by_user_id" = auth.uid());

-- Invitees can see invitations for their email.
CREATE POLICY "staff_invitations_invitee_select" ON "staff_invitations" FOR SELECT
  USING (
    "email" = (SELECT "email" FROM "profiles" WHERE "id" = auth.uid())
  );

-- Tavli admins can read every invitation for support + reconciliation.
CREATE POLICY "staff_invitations_tavli_admin_read" ON "staff_invitations" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid() AND p."role" = 'admin'
  ));

COMMIT;
