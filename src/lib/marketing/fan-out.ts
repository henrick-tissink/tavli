/**
 * §11 §3.3.1 / §14 — `marketing.fan-out-campaign`. Materializes a campaign's
 * segment in chunks of 500: multi-row INSERT `marketing_sends` (queued) + batch
 * enqueue per-recipient `marketing.send-message`, then re-enqueues itself with
 * the next offset until the segment is exhausted. Caps at 50k recipients.
 */
import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { enqueue as realEnqueue } from "@/lib/jobs/enqueue";
import { JOBS } from "@/lib/jobs/keys";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { compileSegmentFilter, type SegmentCondition, type Combinator } from "@/lib/marketing/segment-compile";

const CHUNK = 500;
const MAX_RECIPIENTS = 50_000;

interface Deps {
  db: typeof dbAdmin;
  enqueue: typeof realEnqueue;
  recordAudit: typeof realRecordAudit;
}

export interface FanOutPayload {
  campaignId: string;
  offset?: number;
}

interface CampaignRow {
  id: string;
  organization_id: string;
  restaurant_id: string | null;
  channel: string;
  recipient_count_estimate: number | null;
  filter_dsl: { conditions: SegmentCondition[] } | null;
  combinator: Combinator | null;
  is_snapshot: boolean | null;
  snapshot_diner_ids: string[] | null;
}
interface Recipient {
  id: string;
  email: string | null;
  phone: string | null;
  locale: string;
}

export function makeFanOutCampaign(deps: Deps) {
  return async function fanOutCampaign(payload: FanOutPayload): Promise<void> {
    const offset = payload.offset ?? 0;
    if (offset >= MAX_RECIPIENTS) return; // safety cap

    const campaignRows = (await deps.db.execute(sql`
      SELECT c.id, c.organization_id, c.restaurant_id, c.channel, c.recipient_count_estimate,
             s.filter_dsl, s.combinator, s.is_snapshot, s.snapshot_diner_ids
      FROM marketing_campaigns c
      LEFT JOIN marketing_segments s ON s.id = c.segment_id
      WHERE c.id = ${payload.campaignId}
    `)) as unknown as CampaignRow[];
    const c = campaignRows[0];
    if (!c) return;

    if (offset === 0) {
      await deps.recordAudit({
        action: AUDIT.marketing.campaign_sent,
        subjectType: "marketing_campaign",
        subjectId: c.id,
        actorRole: "system",
        organizationId: c.organization_id,
        context: { recipient_count: c.recipient_count_estimate ?? null },
      });
    }

    const where: SQL = c.is_snapshot && c.snapshot_diner_ids
      ? sql`d.id = ANY(${c.snapshot_diner_ids}::uuid[])`
      : sql`${compileSegmentFilter(c.filter_dsl?.conditions ?? [], c.combinator ?? "and")}`;

    const recipients = (await deps.db.execute(sql`
      SELECT d.id, d.email, d.phone, d.locale FROM diners d
      WHERE d.organization_id = ${c.organization_id} AND d.redacted_at IS NULL AND ${where}
      ORDER BY d.id LIMIT ${CHUNK} OFFSET ${offset}
    `)) as unknown as Recipient[];

    if (recipients.length > 0) {
      const identifier = (r: Recipient) => (c.channel === "sms" || c.channel === "whatsapp" ? r.phone : r.email);
      const values: SQL[] = recipients.map(
        (r) => sql`(${c.id}, ${r.id}, ${c.organization_id}, ${c.restaurant_id}, ${c.channel}::marketing_channel, ${r.locale}, ${identifier(r)}, 'queued'::marketing_send_status)`,
      );
      const inserted = (await deps.db.execute(sql`
        INSERT INTO marketing_sends (campaign_id, diner_id, organization_id, restaurant_id, channel, locale,
          ${c.channel === "sms" || c.channel === "whatsapp" ? sql`phone` : sql`email`}, status)
        VALUES ${sql.join(values, sql`, `)}
        RETURNING id
      `)) as unknown as Array<{ id: string }>;
      for (const row of inserted) {
        await deps.enqueue(JOBS.marketing.sendMessage, { sendId: row.id });
      }
    }

    if (recipients.length === CHUNK) {
      await deps.enqueue(JOBS.marketing.fanOut, { campaignId: c.id, offset: offset + CHUNK });
    }
  };
}

export const fanOutCampaign = makeFanOutCampaign({ db: dbAdmin, enqueue: realEnqueue, recordAudit: realRecordAudit });
