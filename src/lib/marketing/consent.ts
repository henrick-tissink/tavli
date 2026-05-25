/**
 * §11 §9.2 / §4.11 — consent capture/revoke. Writes the EXISTING canonical
 * `marketing_consents` table (channel '{x}_marketing'), appends the rich
 * append-only `marketing_consent_audit`, and emits `AUDIT.marketing.*`. On
 * opt-out it cascades a suppression (suppression supersedes consent, §3.6).
 *
 * One active consent row per (diner, channel): a state change revokes the
 * current active row then inserts a new one. Idempotent on an unchanged state.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { marketingConsentChannel, type MarketingChannel } from "@/lib/marketing/channel";
import { makeSuppression } from "@/lib/marketing/suppression";

type ConsentSource = "booking_flow" | "qr_tent" | "venue_page" | "walk_in_manual" | "csv_import" | "review_flow" | "admin";

interface Deps {
  db: typeof dbAdmin;
  recordAudit: typeof realRecordAudit;
  suppression: ReturnType<typeof makeSuppression>;
}

export interface RecordConsentInput {
  dinerId: string;
  organizationId: string;
  channel: MarketingChannel;
  source: ConsentSource;
  optIn: boolean;
  copyShown: string;
  locale: string;
  sourceSurfaceUrl?: string | null;
  ip?: string | null;
  capturedByUserId?: string | null;
}

export function makeConsent(deps: Deps) {
  return {
    async recordConsent(input: RecordConsentInput): Promise<{ changed: boolean }> {
      const consentCh = marketingConsentChannel(input.channel);

      const currentRows = (await deps.db.execute(sql`
        SELECT consent_given FROM marketing_consents
        WHERE organization_id = ${input.organizationId} AND diner_id = ${input.dinerId}
          AND channel = ${consentCh} AND revoked_at IS NULL
        ORDER BY given_at DESC LIMIT 1
      `)) as unknown as Array<{ consent_given: boolean }>;
      const current = currentRows[0];

      // Idempotent: state already matches.
      if (current && current.consent_given === input.optIn) return { changed: false };

      // Revoke any active row, then insert the new state. The
      // marketing_consents_active_unique index (0050) enforces at most one
      // active row per (org, diner, channel) so this revoke+insert is safe.
      await deps.db.execute(sql`
        UPDATE marketing_consents SET revoked_at = now()
        WHERE organization_id = ${input.organizationId} AND diner_id = ${input.dinerId}
          AND channel = ${consentCh} AND revoked_at IS NULL
      `);
      await deps.db.execute(sql`
        INSERT INTO marketing_consents (
          diner_id, organization_id, channel, consent_given, source, given_at,
          source_surface_url, source_ip, consent_copy_shown, consent_locale
        ) VALUES (
          ${input.dinerId}, ${input.organizationId}, ${consentCh}, ${input.optIn}, ${input.source}, now(),
          ${input.sourceSurfaceUrl ?? null}, ${input.ip ?? null}, ${input.copyShown}, ${input.locale}
        )
      `);

      const eventType = input.optIn ? "consent_captured" : "consent_revoked";
      await deps.db.execute(sql`
        INSERT INTO marketing_consent_audit (
          diner_id, organization_id, diner_id_at_event, organization_id_at_event,
          channel, event_type, reason, actor_user_id, context
        ) VALUES (
          ${input.dinerId}, ${input.organizationId}, ${input.dinerId}, ${input.organizationId},
          ${input.channel}, ${eventType}, ${input.optIn ? null : "opt_out"}, ${input.capturedByUserId ?? null},
          ${sql`${JSON.stringify({ source: input.source, locale: input.locale })}::jsonb`}
        )
      `);

      await deps.recordAudit({
        action: input.optIn ? AUDIT.marketing.consent_captured : AUDIT.marketing.consent_revoked,
        subjectType: "marketing_consent",
        subjectId: input.dinerId,
        actorUserId: input.capturedByUserId ?? null,
        actorRole: input.capturedByUserId ? "diner" : "system",
        organizationId: input.organizationId,
        context: { channel: input.channel, source: input.source, locale: input.locale },
      });

      // Opt-out cascades a suppression on the diner's contact for this channel.
      if (!input.optIn) {
        const contactRows = (await deps.db.execute(sql`
          SELECT email, phone FROM diners WHERE id = ${input.dinerId}
        `)) as unknown as Array<{ email: string | null; phone: string | null }>;
        const contact = contactRows[0];
        const identifier = input.channel === "sms" || input.channel === "whatsapp" ? contact?.phone : contact?.email;
        if (identifier) {
          await deps.suppression.addSuppression({
            organizationId: input.organizationId,
            channel: input.channel,
            identifier,
            reason: "unsubscribed",
          });
        }
      }

      return { changed: true };
    },

    /**
     * §04 §6.2 — capture consent for TRANSACTIONAL SMS (booking confirmations /
     * reminders). sendTransactionalSms gates on a marketing_consents row with
     * channel='sms_transactional' (TV202) which recordConsent can't emit (it
     * only writes the '*_marketing' channels). Without this writer the SMS path
     * was a dead end. Opt-out is via the global STOP suppression (§04 §5.3), so
     * no suppression cascade here.
     */
    async recordTransactionalSmsConsent(input: {
      dinerId: string;
      organizationId: string;
      optIn: boolean;
      copyShown: string;
      locale: string;
      sourceSurfaceUrl?: string | null;
      ip?: string | null;
    }): Promise<{ changed: boolean }> {
      const currentRows = (await deps.db.execute(sql`
        SELECT consent_given FROM marketing_consents
        WHERE organization_id = ${input.organizationId} AND diner_id = ${input.dinerId}
          AND channel = 'sms_transactional' AND revoked_at IS NULL
        ORDER BY given_at DESC LIMIT 1
      `)) as unknown as Array<{ consent_given: boolean }>;
      if (currentRows[0] && currentRows[0].consent_given === input.optIn) return { changed: false };

      await deps.db.execute(sql`
        UPDATE marketing_consents SET revoked_at = now()
        WHERE organization_id = ${input.organizationId} AND diner_id = ${input.dinerId}
          AND channel = 'sms_transactional' AND revoked_at IS NULL
      `);
      await deps.db.execute(sql`
        INSERT INTO marketing_consents (
          diner_id, organization_id, channel, consent_given, source, given_at,
          source_surface_url, source_ip, consent_copy_shown, consent_locale
        ) VALUES (
          ${input.dinerId}, ${input.organizationId}, 'sms_transactional', ${input.optIn}, 'booking_flow', now(),
          ${input.sourceSurfaceUrl ?? null}, ${input.ip ?? null}, ${input.copyShown}, ${input.locale}
        )
      `);
      await deps.recordAudit({
        action: input.optIn ? AUDIT.marketing.consent_captured : AUDIT.marketing.consent_revoked,
        subjectType: "marketing_consent",
        subjectId: input.dinerId,
        actorRole: "diner",
        organizationId: input.organizationId,
        context: { channel: "sms_transactional", source: "booking_flow", locale: input.locale },
      });
      return { changed: true };
    },

    async hasConsent(dinerId: string, organizationId: string, channel: MarketingChannel): Promise<boolean> {
      const consentCh = marketingConsentChannel(channel);
      const rows = (await deps.db.execute(sql`
        SELECT consent_given FROM marketing_consents
        WHERE organization_id = ${organizationId} AND diner_id = ${dinerId}
          AND channel = ${consentCh} AND revoked_at IS NULL
        ORDER BY given_at DESC LIMIT 1
      `)) as unknown as Array<{ consent_given: boolean }>;
      return rows[0]?.consent_given === true;
    },
  };
}

export const consent = makeConsent({
  db: dbAdmin,
  recordAudit: realRecordAudit,
  suppression: makeSuppression({ db: dbAdmin, recordAudit: realRecordAudit }),
});
