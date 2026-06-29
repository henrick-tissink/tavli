/**
 * Production wiring for the marketing senders + send-message leaf handler.
 * Clients are built lazily with keyless dev fallbacks (console-log) — mirrors
 * the §04 transactional wrappers, so the worker imports without live keys.
 */
import "server-only";
import { dbAdmin } from "@/lib/db/admin";
import { makeMarketingSenders } from "@/lib/marketing/send/senders";
import { makeMarketingPolicy } from "@/lib/marketing/send/policy";
import { makeSendMessageHandler } from "@/lib/marketing/send-message-handler";
import { suppression } from "@/lib/marketing/suppression";
import { consent } from "@/lib/marketing/consent";
import { enqueue } from "@/lib/jobs/enqueue";
import type { JobKey } from "@/lib/jobs/keys";

interface ResendLike {
  emails: { send: (i: { from: string; to: string; replyTo?: string; subject: string; html: string; text: string; headers?: Record<string, string> }) => Promise<{ data?: { id: string } | null; error?: { message: string } | null }> };
}
interface TwilioClient {
  messages: {
    create: (o: {
      to: string;
      from: string;
      body?: string;
      contentSid?: string;
      contentVariables?: string;
    }) => Promise<{ sid: string }>;
  };
}

function getResend(): ResendLike {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return {
      emails: {
        send: async (i) => {
          console.log(`[marketing:dev] email → ${i.to}: ${i.subject}`);
          return { data: { id: `dev-${Date.now()}` }, error: null };
        },
      },
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Resend } = require("resend") as typeof import("resend");
  return new Resend(key) as unknown as ResendLike;
}

function getTwilio(): TwilioClient {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return {
      messages: {
        create: async (o) => {
          // B3: never log the recipient phone or message body in plaintext.
          const detail = o.contentSid ? `template ${o.contentSid}` : `${o.body?.length ?? 0} chars`;
          console.log(`[marketing:dev] sms/wa → ***${o.to.slice(-4)} (${detail})`);
          return { sid: `dev-${Date.now()}` };
        },
      },
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilio = require("twilio") as (sid: string, token: string) => TwilioClient;
  return twilio(sid, token);
}

const policy = makeMarketingPolicy({ db: dbAdmin, suppression, consent });

export const marketingSenders = makeMarketingSenders({
  db: dbAdmin,
  policy,
  enqueue: (key, data, options) => enqueue(key as JobKey, data, options),
  resend: getResend(),
  twilio: getTwilio(),
  // Dedicated marketing identity if set, else the operator-configured
  // transactional sender, else the platform default.
  emailFrom: process.env.MARKETING_FROM_EMAIL ?? process.env.EMAIL_FROM ?? "Tavli <hello@tavli.ro>",
  // The documented operator vars. No alphanumeric default: an unset sender
  // fails the send loudly (STOP replies must reach an inbound-capable number),
  // and WhatsApp gets a distinct sender (an SMS sender id is invalid for WA).
  smsFrom: process.env.TWILIO_SMS_FROM ?? null,
  whatsappFrom: process.env.TWILIO_WHATSAPP_FROM ?? null,
});

export const sendMessageHandler = makeSendMessageHandler({ db: dbAdmin, senders: marketingSenders });
