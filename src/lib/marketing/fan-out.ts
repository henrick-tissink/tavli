/**
 * §11 §3.3.1 / §14 — `marketing.fan-out-campaign`. Materializes a campaign's
 * segment in chunks of 500: multi-row INSERT `marketing_sends` (queued) + batch
 * enqueue per-recipient `marketing.send-message`, then re-enqueues itself
 * keyset on the last diner id until the segment is exhausted. Caps at 50k
 * recipients (tracked via `processed`).
 *
 * Keyset (d.id > afterId), not OFFSET (audit #15): the segment is a LIVE query,
 * so diners added/removed between chunks shifted an OFFSET window, skipping or
 * duplicating recipients. Ordering by id and continuing after the last id is
 * stable against concurrent membership changes.
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
  /** Keyset cursor — process diners with id > afterId. Null/absent = first chunk. */
  afterId?: string | null;
  /** Recipients processed so far (for the 50k cap across chunks). */
  processed?: number;
}

interface CampaignRow {
  id: string;
  campaign_version_id: string | null;
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
    const afterId = payload.afterId ?? null;
    const processed = payload.processed ?? 0;
    if (processed >= MAX_RECIPIENTS) return; // safety cap

    const campaignRows = (await deps.db.execute(sql`
      SELECT c.id, c.organization_id, c.restaurant_id, c.channel, c.recipient_count_estimate,
             s.filter_dsl, s.combinator, s.is_snapshot, s.snapshot_diner_ids,
             (SELECT v.id FROM marketing_campaign_versions v
               WHERE v.campaign_id = c.id ORDER BY v.version_number DESC LIMIT 1) AS campaign_version_id
      FROM marketing_campaigns c
      LEFT JOIN marketing_segments s ON s.id = c.segment_id
      WHERE c.id = ${payload.campaignId}
    `)) as unknown as CampaignRow[];
    const c = campaignRows[0];
    if (!c) return;

    if (afterId === null) {
      await deps.recordAudit({
        action: AUDIT.marketing.campaign_sent,
        subjectType: "marketing_campaign",
        subjectId: c.id,
        actorRole: "system",
        organizationId: c.organization_id,
        context: { recipient_count: c.recipient_count_estimate ?? null },
      });
    }

    // No segment (one-off "send to all") ⇒ every diner; a snapshot ⇒ the frozen
    // id list; otherwise the saved/ad-hoc segment DSL. Consent / suppression /
    // freq-cap / quota are all enforced per-recipient downstream in the policy
    // stack, so an unsegmented campaign safely targets the whole opted-in base.
    // (C1: compileSegmentFilter([]) throws TV900 — never call it with no conditions.)
    const where: SQL = c.is_snapshot && c.snapshot_diner_ids
      ? sql`d.id = ANY(${c.snapshot_diner_ids}::uuid[])`
      : c.filter_dsl?.conditions?.length
        ? compileSegmentFilter(c.filter_dsl.conditions, c.combinator ?? "and")
        : sql`true`;

    // NEW-8: cross-channel dedup (§11 §8.4 step 6 — "one human, one message").
    // Two diner records sharing the channel identifier (email, or phone for
    // sms/whatsapp) must yield ONE send. Keep only the lowest-id diner per
    // identifier — a global predicate, so it dedups across keyset chunks too —
    // and drop diners with no identifier for this channel (can't contact them).
    const isPhoneChannel = c.channel === "sms" || c.channel === "whatsapp";
    const dedup: SQL = isPhoneChannel
      ? sql`AND d.phone IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM diners d2 WHERE d2.organization_id = d.organization_id
            AND d2.redacted_at IS NULL AND d2.id < d.id AND d2.phone = d.phone)`
      : sql`AND d.email IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM diners d2 WHERE d2.organization_id = d.organization_id
            AND d2.redacted_at IS NULL AND d2.id < d.id AND lower(d2.email) = lower(d.email))`;

    const recipients = (await deps.db.execute(sql`
      SELECT d.id, d.email, d.phone, d.locale FROM diners d
      WHERE d.organization_id = ${c.organization_id} AND d.redacted_at IS NULL
        AND d.processing_restricted = false AND ${where}
        ${dedup}
        ${afterId ? sql`AND d.id > ${afterId}::uuid` : sql``}
      ORDER BY d.id LIMIT ${CHUNK}
    `)) as unknown as Recipient[];

    if (recipients.length > 0) {
      const identifier = (r: Recipient) => (c.channel === "sms" || c.channel === "whatsapp" ? r.phone : r.email);
      const values: SQL[] = recipients.map(
        (r) => sql`(${c.id}, ${c.campaign_version_id ?? null}, ${r.id}, ${c.organization_id}, ${c.restaurant_id}, ${c.channel}::marketing_channel, ${r.locale}, ${identifier(r)}, 'queued'::marketing_send_status)`,
      );
      const inserted = (await deps.db.execute(sql`
        INSERT INTO marketing_sends (campaign_id, campaign_version_id, diner_id, organization_id, restaurant_id, channel, locale,
          ${c.channel === "sms" || c.channel === "whatsapp" ? sql`phone` : sql`email`}, status)
        VALUES ${sql.join(values, sql`, `)}
        RETURNING id
      `)) as unknown as Array<{ id: string }>;
      for (const row of inserted) {
        await deps.enqueue(JOBS.marketing.sendMessage, { sendId: row.id });
      }
    }

    if (recipients.length === CHUNK) {
      const lastId = recipients[recipients.length - 1].id;
      await deps.enqueue(JOBS.marketing.fanOut, {
        campaignId: c.id,
        afterId: lastId,
        processed: processed + recipients.length,
      });
    }
  };
}

export const fanOutCampaign = makeFanOutCampaign({ db: dbAdmin, enqueue: realEnqueue, recordAudit: realRecordAudit });
