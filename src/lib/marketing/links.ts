/**
 * §11 §5.2 / §11.3 — click-tracking (/c) + unsubscribe (/u) logic. Kept in a lib
 * (injected db/suppression/audit) so it's testable; the route handlers are thin
 * wrappers. RFC 8058: the unsubscribe GET only confirms; the POST revokes.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { verifySendToken } from "@/lib/marketing/tokens";
import { marketingConsentChannel, type MarketingChannel } from "@/lib/marketing/channel";
import { makeSuppression } from "@/lib/marketing/suppression";

interface SendRow {
  campaign_id: string;
  diner_id: string | null;
  organization_id: string;
  channel: MarketingChannel;
  identifier: string | null;
}

async function loadSend(db: typeof dbAdmin, sendId: string): Promise<SendRow | null> {
  const rows = (await db.execute(sql`
    SELECT campaign_id, diner_id, organization_id, channel, coalesce(email, phone) AS identifier
    FROM marketing_sends WHERE id = ${sendId}
  `)) as unknown as SendRow[];
  return rows[0] ?? null;
}

export function makeRecordClick(deps: { db: typeof dbAdmin }) {
  return async function recordClick(input: {
    sendId: string;
    token: string;
    dst: string;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<{ redirectTo: string } | { error: "not_found" | "invalid" }> {
    const send = await loadSend(deps.db, input.sendId);
    if (!send || !send.diner_id) return { error: "not_found" };
    if (!verifySendToken(input.sendId, input.token, { campaignId: send.campaign_id, dinerId: send.diner_id })) {
      return { error: "invalid" };
    }
    // Token is valid → the redirect is authorised. Click LOGGING is best-effort:
    // a DB failure here must not drop a legitimate recipient's click-through, so
    // it never propagates (the route only treats an unverifiable token as a 4xx).
    try {
      await deps.db.execute(sql`
        INSERT INTO marketing_link_clicks (send_id, link_token, destination_url, ip, user_agent)
        VALUES (${input.sendId}, ${input.token.slice(0, 20)}, ${input.dst}, ${input.ip ?? null}, ${input.userAgent ?? null})
      `);
      await deps.db.execute(sql`
        UPDATE marketing_sends SET first_clicked_at = COALESCE(first_clicked_at, now()), click_count = click_count + 1
        WHERE id = ${input.sendId}
      `);
    } catch (e) {
      console.error(`[marketing] click logging failed for send ${input.sendId}`, e);
    }
    return { redirectTo: input.dst };
  };
}

interface UnsubDeps {
  db: typeof dbAdmin;
  suppression: ReturnType<typeof makeSuppression>;
  recordAudit: typeof realRecordAudit;
}

export function makeUnsubscribe(deps: UnsubDeps) {
  return {
    /** GET — does NOT revoke (prefetch-safe); reports token validity for the confirm page. */
    async verify(sendId: string, token: string): Promise<{ valid: boolean }> {
      const send = await loadSend(deps.db, sendId);
      if (!send || !send.diner_id) return { valid: false };
      return { valid: verifySendToken(sendId, token, { campaignId: send.campaign_id, dinerId: send.diner_id }) };
    },

    /** POST — revoke consent + suppress + mark the send. */
    async unsubscribe(sendId: string, token: string): Promise<{ ok: boolean }> {
      const send = await loadSend(deps.db, sendId);
      if (!send || !send.diner_id) return { ok: false };
      if (!verifySendToken(sendId, token, { campaignId: send.campaign_id, dinerId: send.diner_id })) return { ok: false };

      await deps.db.execute(sql`
        UPDATE marketing_consents SET revoked_at = now()
        WHERE diner_id = ${send.diner_id} AND channel = ${marketingConsentChannel(send.channel)} AND revoked_at IS NULL
      `);
      if (send.identifier) {
        await deps.suppression.addSuppression({
          organizationId: send.organization_id,
          channel: send.channel,
          identifier: send.identifier,
          reason: "unsubscribed",
          sourceSendId: sendId,
          actorRole: "diner",
        });
      }
      await deps.db.execute(sql`
        INSERT INTO marketing_consent_audit (diner_id, organization_id, diner_id_at_event, organization_id_at_event, channel, event_type, reason)
        VALUES (${send.diner_id}, ${send.organization_id}, ${send.diner_id}, ${send.organization_id}, ${send.channel}, 'consent_revoked', 'unsubscribed')
      `);
      await deps.db.execute(sql`
        UPDATE marketing_sends SET status = 'unsubscribed', unsubscribed_at = now(), status_updated_at = now() WHERE id = ${sendId}
      `);
      await deps.recordAudit({
        action: AUDIT.marketing.consent_revoked,
        subjectType: "marketing_consent",
        subjectId: send.diner_id,
        actorRole: "diner",
        organizationId: send.organization_id,
        context: { channel: send.channel, reason: "unsubscribed" },
      });
      return { ok: true };
    },
  };
}

export const recordClick = makeRecordClick({ db: dbAdmin });
export const unsubscribeHandler = makeUnsubscribe({
  db: dbAdmin,
  suppression: makeSuppression({ db: dbAdmin, recordAudit: realRecordAudit }),
  recordAudit: realRecordAudit,
});
