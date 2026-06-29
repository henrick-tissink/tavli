/**
 * §11 §3.6 / §4.8 — suppression list. Suppression supersedes consent: a
 * suppressed (channel, identifier) is skipped at send time even with an active
 * consent row.
 *
 * v1 scope note: suppression is GLOBAL per (channel, lower(identifier)) — the
 * existing `marketing_suppressions_channel_id_unique` index is global and §04
 * bounce-handling depends on it. Conservative (an unsub stops marketing
 * everywhere) + ANPC-safe. Org-scoped suppression (§4.8 "org-scoped by design")
 * is deferred to v1.5 (needs reworking that shared unique index). `organization_id`
 * is still recorded on the row for provenance.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { AUDIT, type ActorRole } from "@/lib/audit/actions";
import { suppressionChannel, type MarketingChannel } from "@/lib/marketing/channel";

interface Deps {
  db: typeof dbAdmin;
  recordAudit: typeof realRecordAudit;
}

export interface AddSuppressionInput {
  // Nullable: an inbound STOP (§04 §5.3) suppresses globally and may not resolve
  // to an org (a cold STOP from someone with no prior send). The row's org is
  // provenance only; the unique index is global per (channel, identifier).
  organizationId: string | null;
  channel: MarketingChannel;
  identifier: string; // email (any case) or E.164 phone
  reason: "unsubscribed" | "bounce" | "complaint" | "stop_keyword" | "admin" | "gdpr_request";
  sourceSendId?: string | null;
  actorUserId?: string | null;
  actorRole?: ActorRole;
}

export function makeSuppression(deps: Deps) {
  return {
    async addSuppression(input: AddSuppressionInput): Promise<void> {
      const channel = suppressionChannel(input.channel);
      await deps.db.execute(sql`
        INSERT INTO marketing_suppressions (channel, identifier, source, reason, organization_id, source_send_id)
        VALUES (${channel}, ${input.identifier}, 'marketing', ${input.reason}, ${input.organizationId}, ${input.sourceSendId ?? null})
        ON CONFLICT (channel, lower(identifier)) DO UPDATE SET
          unsuppressed_at = NULL,
          reason = excluded.reason,
          source_send_id = COALESCE(excluded.source_send_id, marketing_suppressions.source_send_id)
      `);
      await deps.recordAudit({
        action: AUDIT.marketing.suppression_added,
        subjectType: "marketing_suppression",
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? "system",
        organizationId: input.organizationId,
        context: { channel, reason: input.reason },
      });
    },

    async isSuppressed(channel: MarketingChannel, identifier: string): Promise<boolean> {
      const rows = (await deps.db.execute(sql`
        SELECT 1 FROM marketing_suppressions
        WHERE channel = ${suppressionChannel(channel)}
          AND lower(identifier) = lower(${identifier})
          AND unsuppressed_at IS NULL
        LIMIT 1
      `)) as unknown as unknown[];
      return rows.length > 0;
    },

    async liftSuppression(
      channel: MarketingChannel,
      identifier: string,
      // Restrict which suppression reasons may be lifted. A diner re-opting in
      // may only clear their own prior unsubscribe — NOT a hard bounce, spam
      // complaint, carrier STOP, GDPR or admin suppression (deliverability +
      // compliance). Omit to lift regardless of reason (e.g. SMS START).
      opts?: { reasons?: AddSuppressionInput["reason"][] },
    ): Promise<void> {
      const reasonFilter =
        opts?.reasons && opts.reasons.length
          ? sql`AND reason = ANY(${opts.reasons}::text[])`
          : sql``;
      await deps.db.execute(sql`
        UPDATE marketing_suppressions SET unsuppressed_at = now()
        WHERE channel = ${suppressionChannel(channel)} AND lower(identifier) = lower(${identifier})
          AND unsuppressed_at IS NULL ${reasonFilter}
      `);
    },
  };
}

export const suppression = makeSuppression({ db: dbAdmin, recordAudit: realRecordAudit });
