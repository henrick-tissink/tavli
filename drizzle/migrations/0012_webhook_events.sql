-- 0012_webhook_events.sql
-- Shared inbound-webhook substrate per foundations §6.6. Used by Resend
-- (bounces/complaints), Twilio (status + STOP inbound), Stripe
-- (subscription events), Meta WhatsApp.
--
-- Writes go through src/lib/webhooks/handle.ts (service role, bypasses
-- RLS). The unique (provider, provider_event_id) index is the
-- idempotency guarantee — onConflictDoNothing returns 200 to stop
-- provider retries on duplicates.
--
-- Reads are gated to Tavli admins only. There is no per-restaurant
-- read policy because webhook rows are infrastructural, not venue data.

CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"signature_verified" boolean NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"process_error" text,
	"process_attempts" integer DEFAULT 0 NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_idem" ON "webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_unprocessed" ON "webhook_events" USING btree ("provider","received_at") WHERE "webhook_events"."processed_at" is null;--> statement-breakpoint

-- ─── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;

-- Tavli admins can read every webhook event for support + reconciliation.
CREATE POLICY "webhook_events_admin_read" ON "webhook_events" FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM "profiles" p
    WHERE p."id" = auth.uid()
      AND p."role" = 'admin'
  ));

-- No INSERT/UPDATE/DELETE policies. Writes and mid-flight updates
-- (processed_at, process_error, process_attempts) all come from the
-- service-role ingestWebhook helper.
