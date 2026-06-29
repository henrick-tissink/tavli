/**
 * §11 §6 / §14 — `marketing.fire-triggered-campaign`. Enqueued by §02/§03 event
 * hooks (reservation.completed / no_show, diner.created / birthday / lapsed_*).
 * Finds the active triggered campaigns matching the event and, for each, creates
 * a `marketing_sends` row + enqueues the leaf `send-message` job.
 *
 * The event EMITTERS (the §02/§03 call sites) are a forward-declared seam — wired
 * when those event sources land. This consumer is the §11 side.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { enqueue as realEnqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";

interface Deps {
  db: typeof dbAdmin;
  enqueue: typeof realEnqueue;
}

export interface FireTriggeredPayload {
  triggerEvent: string; // 'reservation.completed' | 'reservation.no_show' | 'diner.created' | 'diner.birthday' | 'diner.lapsed_60d' | ...
  dinerId: string;
  organizationId: string;
  restaurantId?: string | null;
  // Occurrence id from the emitter (reservationId, dinerId, dinerId:date,
  // dinerId:season). Sets marketing_sends.dedup_key so a retry of this consumer
  // can't insert a second send for the same occurrence, while a legitimately
  // repeated trigger (next visit / next birthday) still sends (audit #11). The
  // emitters all already carry this value in their enqueue singletonKey.
  dedupKey?: string | null;
}

export function makeFireTriggeredCampaign(deps: Deps) {
  return async function fireTriggeredCampaign(payload: FireTriggeredPayload): Promise<void> {
    const diners = (await deps.db.execute(sql`
      SELECT email, phone, locale FROM diners WHERE id = ${payload.dinerId} AND redacted_at IS NULL
    `)) as unknown as Array<{ email: string | null; phone: string | null; locale: string }>;
    const diner = diners[0];
    if (!diner) return;

    // §11 §4.4 — resolve the campaign's content-version snapshot (the triggered
    // seed creates version 1) so each send is attributable to the exact content.
    const campaigns = (await deps.db.execute(sql`
      SELECT id, channel, trigger_offset_seconds,
             (SELECT v.id FROM marketing_campaign_versions v
               WHERE v.campaign_id = marketing_campaigns.id
               ORDER BY v.version_number DESC LIMIT 1) AS campaign_version_id
      FROM marketing_campaigns
      WHERE organization_id = ${payload.organizationId}
        AND kind = 'triggered' AND status = 'active' AND trigger_event = ${payload.triggerEvent}
        AND (restaurant_id IS NULL OR restaurant_id = ${payload.restaurantId ?? null})
    `)) as unknown as Array<{ id: string; channel: string; trigger_offset_seconds: number | null; campaign_version_id: string | null }>;

    const dedupKey = payload.dedupKey ?? null;
    for (const c of campaigns) {
      const identifier = c.channel === "sms" || c.channel === "whatsapp" ? diner.phone : diner.email;
      // dedup_key (the occurrence id) + ON CONFLICT DO NOTHING make a retried
      // run idempotent per (campaign, occurrence); `if (!rows[0]) continue`
      // skips the enqueue when the row already existed. dedup_key NULL (no
      // occurrence supplied) preserves the prior always-insert behaviour.
      const rows = (await deps.db.execute(sql`
        INSERT INTO marketing_sends (campaign_id, campaign_version_id, diner_id, organization_id, restaurant_id, channel, locale,
          ${c.channel === "sms" || c.channel === "whatsapp" ? sql`phone` : sql`email`}, status, dedup_key)
        VALUES (${c.id}, ${c.campaign_version_id ?? null}, ${payload.dinerId}, ${payload.organizationId}, ${payload.restaurantId ?? null},
          ${c.channel}::marketing_channel, ${diner.locale}, ${identifier}, 'queued'::marketing_send_status, ${dedupKey})
        ON CONFLICT (campaign_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
        RETURNING id
      `)) as unknown as Array<{ id: string }>;
      if (!rows[0]) continue;
      // The per-campaign offset is applied here (not at the emitter) so one
      // event can serve several campaigns with different delays. pg-boss
      // startAfter takes seconds; negatives (e.g. birthday −7d) clamp to 0.
      const delay = Math.max(0, c.trigger_offset_seconds ?? 0);
      await deps.enqueue(
        JOBS.marketing.sendMessage,
        { sendId: rows[0].id },
        delay > 0 ? { startAfter: delay } : {},
      );
    }
  };
}

export const fireTriggeredCampaign = makeFireTriggeredCampaign({ db: dbAdmin, enqueue: realEnqueue });
