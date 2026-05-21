-- 0013_org_and_staff.sql
-- Identity Wave 2 substrate per §01 §3.2/§3.3/§3.4. Adds the three new
-- identity tables plus their RLS policies. Service-role writes via the
-- forthcoming admin/setup helpers; reads gated to members + Tavli admin.
--
-- Out of scope for this migration (lands in a follow-up unit):
--   - §3.5 staff_invitations table
--   - §3.6 restaurants.organization_id + drop owner_user_id
--   - §3.6 profiles.default_organization_id
-- Membership-table mutation policies (INSERT/UPDATE/DELETE on
-- organization_members + restaurant_staff) are intentionally absent —
-- service-role writes via forthcoming src/lib/identity/* helpers (§5/§6).
-- SELECTs are narrowed to user_id = auth.uid() per the 0009 precedent
-- (cross-member team-roster UI requires a SECURITY DEFINER helper, deferred).

CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'manager');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('pending_verification', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."venue_staff_role" AS ENUM('owner', 'manager', 'host');--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_by_user_id" uuid,
	CONSTRAINT "organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"legal_name" varchar(300),
	"country_code" varchar(2) DEFAULT 'RO' NOT NULL,
	"tax_id" varchar(60),
	"vat_number" varchar(60),
	"registration_number" varchar(60),
	"billing_address" text,
	"billing_city" varchar(100),
	"billing_country" varchar(100),
	"primary_contact_email" varchar(255) NOT NULL,
	"primary_contact_phone" varchar(60),
	"locale" varchar(2) DEFAULT 'ro' NOT NULL,
	"status" "org_status" DEFAULT 'pending_verification' NOT NULL,
	"stripe_customer_id" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "restaurant_staff" (
	"restaurant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "venue_staff_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_by_user_id" uuid,
	CONSTRAINT "restaurant_staff_restaurant_id_user_id_pk" PRIMARY KEY("restaurant_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_staff" ADD CONSTRAINT "restaurant_staff_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_staff" ADD CONSTRAINT "restaurant_staff_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_staff" ADD CONSTRAINT "restaurant_staff_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "organization_members" USING btree ("user_id") WHERE "organization_members"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_tax_id_unique" ON "organizations" USING btree ("country_code","tax_id") WHERE "organizations"."tax_id" is not null;--> statement-breakpoint
CREATE INDEX "organizations_status_idx" ON "organizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "restaurant_staff_user_idx" ON "restaurant_staff" USING btree ("user_id") WHERE "restaurant_staff"."is_active" = true;--> statement-breakpoint
CREATE INDEX "restaurant_staff_restaurant_idx" ON "restaurant_staff" USING btree ("restaurant_id") WHERE "restaurant_staff"."is_active" = true;

-- ─── RLS ────────────────────────────────────────────────────────────────

-- organizations: members can read; owners/admins can update; insert+delete
-- are service-role only (signup flow + admin tooling).
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_member_select" ON "organizations" FOR SELECT
  USING (
    "id" IN (
      SELECT "organization_id" FROM "organization_members"
      WHERE "user_id" = auth.uid() AND "is_active" = true
    )
  );

CREATE POLICY "organizations_admin_update" ON "organizations" FOR UPDATE
  USING (
    "id" IN (
      SELECT "organization_id" FROM "organization_members"
      WHERE "user_id" = auth.uid()
        AND "is_active" = true
        AND "role" IN ('owner', 'admin')
    )
  );

-- Tavli admin shortcut read (matches the pattern used by audit_logs +
-- webhook_events). Lets Tavli employees see every org for support.
CREATE POLICY "organizations_tavli_admin_read" ON "organizations" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid() AND p."role" = 'admin'
  ));

-- organization_members: a member can see their own membership row. The
-- cross-member team-roster UI is deferred to a SECURITY DEFINER helper
-- per the 0009 precedent (a self-referencing subquery here triggers
-- Postgres 42P17 recursion).
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_members_member_select" ON "organization_members" FOR SELECT
  USING ("user_id" = auth.uid());

-- No INSERT/UPDATE/DELETE policies. Writes come from service-role helpers
-- in src/lib/identity/* (§5/§6 future units), which bypass RLS. Matches
-- the audit_logs + webhook_events pattern — keeps mutation surface off
-- the authenticated role and avoids the privilege-escalation footgun of
-- a FOR ALL policy without WITH CHECK.

CREATE POLICY "organization_members_tavli_admin_read" ON "organization_members" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid() AND p."role" = 'admin'
  ));

-- restaurant_staff: select your own staff row only. The cross-scope path
-- (sibling staff visibility + org-member visibility via the future
-- restaurants.organization_id column) is deferred along with §3.6 and
-- will route through a SECURITY DEFINER helper to avoid the Postgres
-- 42P17 recursion that a self-referencing subquery here would trigger
-- (per the 0009 precedent).
ALTER TABLE "restaurant_staff" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "restaurant_staff_select" ON "restaurant_staff" FOR SELECT
  USING ("user_id" = auth.uid());

-- No INSERT/UPDATE/DELETE policies. Writes come from service-role helpers
-- in src/lib/identity/* (§5/§6 future units), which bypass RLS. Matches
-- the audit_logs + webhook_events pattern — keeps mutation surface off
-- the authenticated role and avoids the privilege-escalation footgun of
-- a FOR ALL policy without WITH CHECK.

CREATE POLICY "restaurant_staff_tavli_admin_read" ON "restaurant_staff" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid() AND p."role" = 'admin'
  ));