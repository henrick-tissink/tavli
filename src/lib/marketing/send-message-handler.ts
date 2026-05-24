/**
 * §11 §14 — `marketing.send-message` leaf handler. Loads the queued send row +
 * its campaign content + diner + venue marketing settings, picks the locale
 * template, and dispatches to the matching channel sender (which re-runs the
 * per-recipient policy at send time).
 *
 * Token substitution beyond the locale pick is minimal in v1 (the campaign
 * builder + full personalisation-token engine are deferred UI).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import type { makeMarketingSenders } from "@/lib/marketing/send/senders";

interface Deps {
  db: typeof dbAdmin;
  senders: ReturnType<typeof makeMarketingSenders>;
}

interface JoinedSend {
  send_id: string;
  campaign_id: string;
  diner_id: string;
  organization_id: string;
  restaurant_id: string | null;
  channel: "email" | "sms" | "whatsapp" | "in_confirmation";
  locale: string;
  identifier: string | null;
  subject_template: Record<string, string>;
  body_template: Record<string, string>;
  freq_cap: number;
  timezone: string;
  quiet_start: string;
  quiet_end: string;
  whatsapp_enabled: boolean;
  whatsapp_business_account_id: string | null;
  whatsapp_phone_number_id: string | null;
}

function pick(tpl: Record<string, string>, locale: string): string {
  return tpl[locale] ?? tpl.ro ?? Object.values(tpl)[0] ?? "";
}

export function makeSendMessageHandler(deps: Deps) {
  return async function sendMessage(payload: { sendId: string }): Promise<void> {
    const rows = (await deps.db.execute(sql`
      SELECT ms.id AS send_id, ms.campaign_id, ms.diner_id, ms.organization_id, ms.restaurant_id,
             ms.channel, ms.locale, coalesce(ms.email, ms.phone) AS identifier,
             c.subject_template, c.body_template,
             o.marketing_frequency_cap_per_month AS freq_cap,
             coalesce(r.timezone, 'Europe/Bucharest') AS timezone,
             coalesce(rms.quiet_hours_start_local::text, '21:00') AS quiet_start,
             coalesce(rms.quiet_hours_end_local::text, '10:00') AS quiet_end,
             coalesce(rms.whatsapp_enabled, false) AS whatsapp_enabled,
             rms.whatsapp_business_account_id, rms.whatsapp_phone_number_id
      FROM marketing_sends ms
      JOIN marketing_campaigns c ON c.id = ms.campaign_id
      JOIN organizations o ON o.id = ms.organization_id
      LEFT JOIN restaurants r ON r.id = ms.restaurant_id
      LEFT JOIN restaurant_marketing_settings rms ON rms.restaurant_id = ms.restaurant_id
      WHERE ms.id = ${payload.sendId} AND ms.status = 'queued'
    `)) as unknown as JoinedSend[];
    const s = rows[0];
    if (!s || !s.identifier) return;

    const input = {
      campaignId: s.campaign_id,
      dinerId: s.diner_id,
      organizationId: s.organization_id,
      restaurantId: s.restaurant_id,
      channel: s.channel,
      locale: s.locale,
      identifier: s.identifier,
      subject: pick(s.subject_template, s.locale),
      body: pick(s.body_template, s.locale),
      policyConfig: {
        freqCap: s.freq_cap,
        includedAllowance: s.channel === "email" || s.channel === "in_confirmation" ? 1000 : 250,
        overageBuffer: 5,
        quietStartLocal: s.quiet_start.slice(0, 5),
        quietEndLocal: s.quiet_end.slice(0, 5),
        timezone: s.timezone,
      },
    };

    if (s.channel === "sms") {
      await deps.senders.sendSms(input);
    } else if (s.channel === "whatsapp") {
      await deps.senders.sendWhatsapp(input, {
        whatsappEnabled: s.whatsapp_enabled,
        whatsappBusinessAccountId: s.whatsapp_business_account_id,
        whatsappPhoneNumberId: s.whatsapp_phone_number_id,
      });
    } else {
      await deps.senders.sendEmail(input);
    }
  };
}
