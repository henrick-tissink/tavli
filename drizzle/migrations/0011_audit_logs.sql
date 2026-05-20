-- 0011_audit_logs.sql
-- Append-only audit substrate per foundations §16.2 + §18 step 14.
--
-- Writes go through src/lib/audit/record.ts (service role, bypasses RLS).
-- Direct INSERT/UPDATE/DELETE from authenticated/anon are forbidden — no
-- write policies are declared. Reads are gated to Tavli admins and the
-- relevant restaurant owner. Org-scoped reads land in Wave 2 with §01.

CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid,
	"actor_user_id" uuid,
	"actor_role" text NOT NULL,
	"impersonator_user_id" uuid,
	"organization_id" uuid,
	"restaurant_id" uuid,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_profiles_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_impersonator_user_id_profiles_id_fk" FOREIGN KEY ("impersonator_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_subject_idx" ON "audit_logs" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_organization_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_restaurant_idx" ON "audit_logs" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

-- Tavli admins can read every audit row.
CREATE POLICY "audit_logs_admin_read" ON "audit_logs" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid()
      AND p."role" = 'admin'
  ));

-- Restaurant owners can read audit rows scoped to their venue.
-- §01 will extend this to restaurant_staff (host/manager) once that table
-- exists; until then only owners see venue-scoped audit trails.
CREATE POLICY "audit_logs_restaurant_owner_read" ON "audit_logs" FOR SELECT
  USING (
    "restaurant_id" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "restaurants" r
      WHERE r."id" = "audit_logs"."restaurant_id"
        AND r."owner_user_id" = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies. Writes come from the service-role
-- recordAudit() helper, which bypasses RLS. The append-only contract is
-- enforced by absence of write policies plus operational discipline
-- (recordAudit is the only sanctioned write path).
