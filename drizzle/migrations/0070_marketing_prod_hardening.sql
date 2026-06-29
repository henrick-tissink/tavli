-- 0070_marketing_prod_hardening
-- Production-readiness hardening for the marketing send path.
--
--  (a) dedup_key + partial unique index on marketing_sends.
--      Makes send materialization idempotent so a retried fan-out chunk or a
--      retried fire-triggered run cannot insert (and therefore send) a second
--      time. One logical send per (campaign_id, dedup_key):
--        - one-off fan-out  → dedup_key = diner_id (one send per diner/campaign)
--        - triggered        → dedup_key = the emitter's occurrence id
--          (reservation_id, diner_id, diner_id:date, diner_id:season) so a
--          retry dedups but a legitimately repeated trigger (next visit, next
--          birthday) is still allowed.
--      Partial (WHERE dedup_key IS NOT NULL): legacy rows / channels that don't
--      set it are unaffected, and NULLs never collide.
--
--  (b) restaurant_marketing_settings.whatsapp_sender_e164.
--      The WhatsApp "from" Twilio accepts is the venue's registered WABA number
--      in E.164. whatsapp_phone_number_id is the opaque Meta id (a gate only),
--      not usable as a Twilio `from`. Per-venue sending identity needs this.
--
--  (c) marketing_campaigns.whatsapp_content_sid.
--      Twilio Content API template SID (HX…) for business-initiated WhatsApp.
--      Meta namespace/name remain for reference; Twilio sends by Content SID.
--      A WhatsApp campaign without one is not sendable (enforced in code).
--
-- All additive (ADD COLUMN / CREATE INDEX IF NOT EXISTS); safe to apply ahead
-- of code.

ALTER TABLE "marketing_sends" ADD COLUMN IF NOT EXISTS "dedup_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "marketing_sends_campaign_dedup"
  ON "marketing_sends" ("campaign_id", "dedup_key")
  WHERE "dedup_key" IS NOT NULL;

ALTER TABLE "restaurant_marketing_settings"
  ADD COLUMN IF NOT EXISTS "whatsapp_sender_e164" varchar(20);

ALTER TABLE "marketing_campaigns"
  ADD COLUMN IF NOT EXISTS "whatsapp_content_sid" varchar(40);
