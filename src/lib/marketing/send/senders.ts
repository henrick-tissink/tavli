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
import { signSendToken } from "@/lib/marketing/tokens";
import { appOrigin } from "@/lib/app-origin";
import { JOBS } from "@/lib/jobs/keys";

interface ResendLike {
  emails: {
    send: (
      i: { from: string; to: string; replyTo?: string; subject: string; html: string; text: string; headers?: Record<string, string> },
      // Idempotency key (per-send) so a retried request can't double-deliver the
      // same email provider-side. The leaf claim is the primary guard; this is
      // defence in depth.
      opts?: { idempotencyKey?: string },
    ) => Promise<{ data?: { id: string } | null; error?: { message: string } | null }>;
  };
}

/**
 * §11 §5.2 — rewrite every absolute http(s) `<a href>` in a marketing email
 * body to the /c click-tracking redirect (carrying the original URL base64url'd
 * in `dst`). mailto:, in-page anchors, and relative links are left alone. Pure,
 * so it's unit-tested in isolation.
 */
export function wrapTrackingLinks(
  html: string,
  opts: { base: string; sendId: string; token: string },
): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (_m, url: string) => {
    const dst = Buffer.from(url, "utf8").toString("base64url");
    return `href="${opts.base}/c/${opts.sendId}/${opts.token}?dst=${dst}"`;
  });
}
interface TwilioClient {
  messages: {
    create: (o: {
      to: string;
      from: string;
      // SMS uses `body`; WhatsApp business-initiated sends use an approved
      // Content template (contentSid + JSON-encoded contentVariables).
      body?: string;
      contentSid?: string;
      contentVariables?: string;
    }) => Promise<{ sid: string }>;
  };
}

export interface MarketingSendInput {
  // NEW-2: the marketing_sends row is pre-inserted (queued) by fan-out /
  // fire-triggered, which mints the link tokens against this id and enqueues the
  // leaf job. The sender UPDATES this row in place — it must NOT insert a new one
  // (doing so orphaned the queued row + poisoned cap/quota/analytics).
  sendId: string;
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
  // Per-venue sender identity (restaurant_marketing_settings). Null → fall back
  // to the global platform identity.
  emailSenderName?: string | null; // display name composed into the email From
  emailReplyTo?: string | null;
  smsSenderId?: string | null; // SMS From override (E.164 / shortcode)
  smsStopShortcode?: string | null; // shortcode shown in the STOP suffix copy
  whatsappContentSid?: string | null; // campaign's Twilio Content SID (HX…)
  policyConfig: Omit<EvaluateInput, "dinerId" | "organizationId" | "channel" | "identifier" | "sendId">;
}

export interface MarketingSendResult {
  sendId: string;
  status: string;
}

interface Deps {
  db: typeof dbAdmin;
  policy: ReturnType<typeof makeMarketingPolicy>;
  // Re-enqueue the leaf job for quiet-hours defer. Injected (not imported) so
  // the senders module stays free of the pg-boss dependency.
  enqueue: (key: string, data: object, options: { startAfter?: Date }) => Promise<unknown>;
  now?: () => Date;
}

// One generic dispatcher: policy → CLAIM → deliver → quota.
async function dispatch(
  deps: Deps,
  input: MarketingSendInput,
  deliver: () => Promise<{ resendId?: string; twilioSid?: string }>,
): Promise<MarketingSendResult> {
  const ev = await deps.policy({
    sendId: input.sendId,
    dinerId: input.dinerId,
    organizationId: input.organizationId,
    channel: input.channel,
    identifier: input.identifier,
    ...input.policyConfig,
  });

  // NEW-2: the row already exists (queued, pre-inserted by fan-out/fire-triggered).
  // We UPDATE it in place by sendId — never INSERT a second row.
  const sendId = input.sendId;

  if (!ev.allow) {
    // §11 §10.3 — quiet hours: DEFER (re-enqueue for the window end), don't drop.
    // The row stays 'queued' so the re-run picks it up; no terminal skip.
    if ("deferUntil" in ev) {
      await deps.enqueue(JOBS.marketing.sendMessage, { sendId }, { startAfter: ev.deferUntil });
      await deps.db.execute(sql`
        UPDATE marketing_sends SET status_updated_at = now() WHERE id = ${sendId}
      `);
      return { sendId, status: "deferred" };
    }
    await deps.db.execute(sql`
      UPDATE marketing_sends SET status = ${ev.skip}, status_updated_at = now() WHERE id = ${sendId}
    `);
    return { sendId, status: ev.skip };
  }

  // Atomically CLAIM the row (queued → sending) BEFORE any provider call. If a
  // retry (provider succeeded but the process died before the 'sent' write) or
  // a concurrent duplicate leaf job reaches here, the row is no longer 'queued',
  // zero rows return, and we abort without re-sending. This is the primary guard
  // against duplicate sends + double quota/overage counting on retry (the leaf
  // handler also only loads 'queued' rows, so a retry never re-enters deliver()).
  const claimed = (await deps.db.execute(sql`
    UPDATE marketing_sends SET status = 'sending', status_updated_at = now()
    WHERE id = ${sendId} AND status = 'queued'
    RETURNING id
  `)) as unknown as Array<{ id: string }>;
  if (claimed.length === 0) return { sendId, status: "already_claimed" };

  let r: { resendId?: string; twilioSid?: string };
  try {
    r = await deliver();
  } catch (err) {
    await deps.db.execute(sql`
      UPDATE marketing_sends SET status = 'failed', status_updated_at = now(),
        failure_message = ${err instanceof Error ? err.message.slice(0, 2000) : String(err)}
      WHERE id = ${sendId}
    `);
    return { sendId, status: "failed" };
  }

  // Provider accepted the message — it is already out. The writes below must
  // NOT be able to flip the row back to 'failed': a failure here leaves the row
  // 'sending' (a retry finds no 'queued' row, so it is never re-sent). This
  // write also persists the provider message id, which is what lets the
  // delivery/bounce webhooks reconcile the row — so retry it a few times so a
  // single transient DB blip can't strand a genuinely-sent message in 'sending'
  // with no provider id (which no webhook could ever match).
  let written = false;
  for (let attempt = 0; attempt < 3 && !written; attempt++) {
    try {
      await deps.db.execute(sql`
        UPDATE marketing_sends SET status = 'sent', sent_at = now(), status_updated_at = now(),
          resend_message_id = ${r.resendId ?? null}, twilio_message_sid = ${r.twilioSid ?? null}
        WHERE id = ${sendId}
      `);
      written = true;
    } catch (e) {
      if (attempt === 2) {
        console.error(`[marketing] FAILED to persist sent state for send ${sendId} after deliver — left 'sending'`, e);
      }
    }
  }
  try {
    await deps.db.execute(sql`
      INSERT INTO marketing_quota_usage (organization_id, year_month, channel, sent_count, included_allowance)
      VALUES (${input.organizationId}, date_trunc('month', now())::date, ${input.channel}, 1, ${allowanceFor(input.channel)})
      ON CONFLICT (organization_id, year_month, channel) DO UPDATE SET sent_count = marketing_quota_usage.sent_count + 1, computed_at = now()
    `);
  } catch (e) {
    console.error(`[marketing] quota increment failed for send ${sendId}`, e);
  }
  return { sendId, status: "sent" };
}

function allowanceFor(channel: MarketingChannel): number {
  return channel === "email" || channel === "in_confirmation" ? 1000 : 250;
}

export interface WhatsappSettings {
  whatsappEnabled: boolean;
  whatsappBusinessAccountId: string | null;
  whatsappPhoneNumberId: string | null;
  // E.164 of the venue's registered WABA number (the Twilio `whatsapp:` from).
  whatsappSenderE164: string | null;
}

/**
 * Compose the email From. With a per-venue display name, keep the platform
 * address but show the venue's name: `Venue <hello@tavli.ro>`. The base may
 * already carry a display name (`Tavli <hello@tavli.ro>`) or be a bare address.
 */
function emailFromWithName(base: string, name?: string | null): string {
  if (!name) return base;
  const m = base.match(/<([^>]+)>/);
  const addr = (m ? m[1] : base).trim();
  return `${name} <${addr}>`;
}

export function makeMarketingSenders(
  deps: Deps & {
    resend: ResendLike;
    twilio: TwilioClient;
    emailFrom: string;
    // Global platform fallbacks; null when unset. SMS/WhatsApp fail loudly at
    // send time rather than ever defaulting to a non-deliverable sender ID.
    smsFrom: string | null;
    whatsappFrom: string | null;
  },
) {
  return {
    sendEmail(input: MarketingSendInput): Promise<MarketingSendResult> {
      return dispatch(deps, input, async () => {
        // §11 §5.2 / §11.3: mint the send-bound HMAC token, wrap body links for
        // click tracking, and attach the RFC 8058 one-click List-Unsubscribe
        // header pointing at /u/<sendId>/<token>. (signSendToken's only producer.)
        const token = signSendToken(input.sendId, { campaignId: input.campaignId, dinerId: input.dinerId });
        const base = appOrigin();
        const res = await deps.resend.emails.send(
          {
            from: emailFromWithName(deps.emailFrom, input.emailSenderName),
            to: input.identifier,
            replyTo: input.emailReplyTo ?? undefined,
            subject: input.subject,
            html: wrapTrackingLinks(input.body, { base, sendId: input.sendId, token }),
            text: input.text ?? "",
            headers: {
              "List-Unsubscribe": `<${base}/u/${input.sendId}/${token}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          },
          { idempotencyKey: input.sendId },
        );
        if (res.error) throw new Error(res.error.message);
        return { resendId: res.data?.id };
      });
    },

    sendSms(input: MarketingSendInput): Promise<MarketingSendResult> {
      // Per-venue sender id first, else the global TWILIO_SMS_FROM. Never fall
      // back to a non-deliverable alphanumeric default — STOP replies must reach
      // an inbound-capable number/shortcode (consent/GDPR).
      const from = input.smsSenderId ?? deps.smsFrom;
      const body = appendStopSuffix(input.body, input.locale, input.smsStopShortcode ?? undefined);
      return dispatch(deps, { ...input, body }, async () => {
        if (!from) throw new Error("sms_sender_unconfigured: set TWILIO_SMS_FROM or the venue sms_sender_id");
        const res = await deps.twilio.messages.create({ to: input.identifier, from, body });
        return { twilioSid: res.sid };
      });
    },

    async sendWhatsapp(input: MarketingSendInput, settings: WhatsappSettings): Promise<MarketingSendResult> {
      // §5.4 TV904 gate — defence-in-depth. Not enabled / unverified → hard fail.
      if (!settings.whatsappEnabled || !settings.whatsappBusinessAccountId || !settings.whatsappPhoneNumberId) {
        throw new Error("TV904 whatsapp_not_enabled: venue not Meta-verified for WhatsApp");
      }
      // The sending identity is the venue's registered WABA number (E.164), else
      // a platform WhatsApp number. Reusing the SMS sender (which may be an
      // alphanumeric id) is invalid for WhatsApp, so it is never used here.
      // Strip any leading `whatsapp:` so a config value of either form is safe
      // (we add the prefix below).
      const from = (settings.whatsappSenderE164 ?? deps.whatsappFrom)?.replace(/^whatsapp:/i, "") ?? null;
      // Business-initiated WhatsApp must use a Meta-approved template, sent via a
      // Twilio Content SID — freeform body is not deliverable outside a session.
      // v1 supports variable-free templates only: contentVariables is not yet
      // populated (no per-campaign variable input), so use approved templates
      // with no {{n}} placeholders until variable mapping lands.
      const contentSid = input.whatsappContentSid;
      return dispatch(deps, input, async () => {
        if (!from) throw new Error("whatsapp_sender_unconfigured: set the venue whatsapp_sender_e164 or TWILIO_WHATSAPP_FROM");
        if (!contentSid) throw new Error("whatsapp_template_missing: campaign has no approved Content template (whatsapp_content_sid)");
        const res = await deps.twilio.messages.create({
          to: `whatsapp:${input.identifier}`,
          from: `whatsapp:${from}`,
          contentSid,
        });
        return { twilioSid: res.sid };
      });
    },
  };
}
