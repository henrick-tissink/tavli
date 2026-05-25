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
}

export function makeFireTriggeredCampaign(deps: Deps) {
  return async function fireTriggeredCampaign(payload: FireTriggeredPayload): Promise<void> {
    const diners = (await deps.db.execute(sql`
      SELECT email, phone, locale FROM diners WHERE id = ${payload.dinerId} AND redacted_at IS NULL
    `)) as unknown as Array<{ email: string | null; phone: string | null; locale: string }>;
    const diner = diners[0];
    if (!diner) return;

    const campaigns = (await deps.db.execute(sql`
      SELECT id, channel, trigger_offset_seconds FROM marketing_campaigns
      WHERE organization_id = ${payload.organizationId}
        AND kind = 'triggered' AND status = 'active' AND trigger_event = ${payload.triggerEvent}
        AND (restaurant_id IS NULL OR restaurant_id = ${payload.restaurantId ?? null})
    `)) as unknown as Array<{ id: string; channel: string; trigger_offset_seconds: number | null }>;

    for (const c of campaigns) {
      const identifier = c.channel === "sms" || c.channel === "whatsapp" ? diner.phone : diner.email;
      const rows = (await deps.db.execute(sql`
        INSERT INTO marketing_sends (campaign_id, diner_id, organization_id, restaurant_id, channel, locale,
          ${c.channel === "sms" || c.channel === "whatsapp" ? sql`phone` : sql`email`}, status)
        VALUES (${c.id}, ${payload.dinerId}, ${payload.organizationId}, ${payload.restaurantId ?? null},
          ${c.channel}::marketing_channel, ${diner.locale}, ${identifier}, 'queued'::marketing_send_status)
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
