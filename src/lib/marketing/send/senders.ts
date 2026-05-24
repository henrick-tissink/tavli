/**
 * §11 §5 — marketing channel senders. Each runs the per-recipient policy, writes
 * a `marketing_sends` row, calls the injected provider client, and increments
 * `marketing_quota_usage`. Providers are DI (the existing Resend/Twilio client
 * interfaces); no live keys. WhatsApp is gated by Meta verification (TV904).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import type { MarketingChannel } from "@/lib/marketing/channel";
import type { makeMarketingPolicy, EvaluateInput } from "@/lib/marketing/send/policy";
import { appendStopSuffix } from "@/lib/marketing/send/stop-suffix";

interface ResendLike {
  emails: { send: (i: { from: string; to: string; replyTo?: string; subject: string; html: string; text: string }) => Promise<{ data?: { id: string } | null; error?: { message: string } | null }> };
}
interface TwilioClient {
  messages: { create: (o: { to: string; from: string; body: string }) => Promise<{ sid: string }> };
}

export interface MarketingSendInput {
  campaignId: string;
  campaignVersionId?: string | null;
  dinerId: string;
  organizationId: string;
  restaurantId: string | null;
  channel: MarketingChannel;
  locale: string;
  identifier: string; // email or E.164 phone
  subject: string;
  body: string; // html for email, text for sms/whatsapp
  text?: string; // email plaintext
  policyConfig: Omit<EvaluateInput, "dinerId" | "organizationId" | "channel" | "identifier">;
}

export interface MarketingSendResult {
  sendId: string;
  status: string;
}

interface Deps {
  db: typeof dbAdmin;
  policy: ReturnType<typeof makeMarketingPolicy>;
  now?: () => Date;
}

// One generic dispatcher: policy → row → deliver → quota.
async function dispatch(
  deps: Deps,
  input: MarketingSendInput,
  deliver: () => Promise<{ resendId?: string; twilioSid?: string }>,
): Promise<MarketingSendResult> {
  const now = deps.now ?? (() => new Date());
  const ev = await deps.policy({
    dinerId: input.dinerId,
    organizationId: input.organizationId,
    channel: input.channel,
    identifier: input.identifier,
    ...input.policyConfig,
  });

  const baseCols = sql`
    campaign_id, campaign_version_id, diner_id, organization_id, restaurant_id, channel, locale,
    ${input.channel === "email" || input.channel === "in_confirmation" ? sql`email` : sql`phone`}, status, status_updated_at
  `;
  const baseVals = (status: string) => sql`
    ${input.campaignId}, ${input.campaignVersionId ?? null}, ${input.dinerId}, ${input.organizationId},
    ${input.restaurantId}, ${input.channel}, ${input.locale}, ${input.identifier}, ${status}, now()
  `;

  if (!ev.allow) {
    const skipRows = (await deps.db.execute(sql`
      INSERT INTO marketing_sends (${baseCols}) VALUES (${baseVals(ev.skip)}) RETURNING id
    `)) as unknown as Array<{ id: string }>;
    return { sendId: skipRows[0]?.id ?? "", status: ev.skip };
  }

  const rows = (await deps.db.execute(sql`
    INSERT INTO marketing_sends (${baseCols}) VALUES (${baseVals("queued")}) RETURNING id
  `)) as unknown as Array<{ id: string }>;
  const sendId = rows[0]!.id;

  try {
    const r = await deliver();
    await deps.db.execute(sql`
      UPDATE marketing_sends SET status = 'sent', sent_at = now(), status_updated_at = now(),
        resend_message_id = ${r.resendId ?? null}, twilio_message_sid = ${r.twilioSid ?? null}
      WHERE id = ${sendId}
    `);
    // Quota increment (upsert the month row).
    await deps.db.execute(sql`
      INSERT INTO marketing_quota_usage (organization_id, year_month, channel, sent_count, included_allowance)
      VALUES (${input.organizationId}, date_trunc('month', now())::date, ${input.channel}, 1, ${allowanceFor(input.channel)})
      ON CONFLICT (organization_id, year_month, channel) DO UPDATE SET sent_count = marketing_quota_usage.sent_count + 1, computed_at = now()
    `);
    void now;
    return { sendId, status: "sent" };
  } catch (err) {
    await deps.db.execute(sql`
      UPDATE marketing_sends SET status = 'failed', status_updated_at = now(),
        failure_message = ${err instanceof Error ? err.message.slice(0, 2000) : String(err)}
      WHERE id = ${sendId}
    `);
    return { sendId, status: "failed" };
  }
}

function allowanceFor(channel: MarketingChannel): number {
  return channel === "email" || channel === "in_confirmation" ? 1000 : 250;
}

export interface WhatsappSettings {
  whatsappEnabled: boolean;
  whatsappBusinessAccountId: string | null;
  whatsappPhoneNumberId: string | null;
}

export function makeMarketingSenders(deps: Deps & { resend: ResendLike; twilio: TwilioClient; emailFrom: string; smsFrom: string }) {
  return {
    sendEmail(input: MarketingSendInput): Promise<MarketingSendResult> {
      return dispatch(deps, input, async () => {
        const res = await deps.resend.emails.send({
          from: deps.emailFrom,
          to: input.identifier,
          subject: input.subject,
          html: input.body,
          text: input.text ?? "",
        });
        if (res.error) throw new Error(res.error.message);
        return { resendId: res.data?.id };
      });
    },

    sendSms(input: MarketingSendInput): Promise<MarketingSendResult> {
      const body = appendStopSuffix(input.body, input.locale);
      return dispatch(deps, { ...input, body }, async () => {
        const res = await deps.twilio.messages.create({ to: input.identifier, from: deps.smsFrom, body });
        return { twilioSid: res.sid };
      });
    },

    async sendWhatsapp(input: MarketingSendInput, settings: WhatsappSettings): Promise<MarketingSendResult> {
      // §5.4 TV904 gate — defence-in-depth. Not enabled / unverified → hard fail.
      if (!settings.whatsappEnabled || !settings.whatsappBusinessAccountId || !settings.whatsappPhoneNumberId) {
        throw new Error("TV904 whatsapp_not_enabled: venue not Meta-verified for WhatsApp");
      }
      return dispatch(deps, input, async () => {
        const res = await deps.twilio.messages.create({ to: `whatsapp:${input.identifier}`, from: `whatsapp:${deps.smsFrom}`, body: input.body });
        return { twilioSid: res.sid };
      });
    },
  };
}
