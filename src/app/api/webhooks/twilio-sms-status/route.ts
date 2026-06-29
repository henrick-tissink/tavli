/**
 * POST /api/webhooks/twilio-sms-status
 *
 * Twilio Programmable Messaging status callback. Verifies the
 * `X-Twilio-Signature` header (HMAC-SHA1 of URL + sorted POST params)
 * using `twilio.validateRequest`, then routes the event through the
 * shared `ingestWebhook` substrate (provides idempotency via the
 * unique (provider, provider_event_id) index on `webhook_events`).
 *
 * Side effects in the handle() callback:
 *   - Maps Twilio MessageStatus → transactional_email_log.sms_status
 *     ({ queued|sent|delivered|undelivered|failed }).
 *   - On undelivered/failed, captures ErrorCode + ErrorMessage into
 *     failure_reason. Successful statuses clear failure_reason.
 *
 * Idempotency key: `${MessageSid}:${MessageStatus}` — Twilio fires one
 * callback per status transition, so the (sid, status) tuple is unique
 * per logical event. Re-deliveries (provider retries) are deduped by
 * the substrate.
 *
 * Spec: docs/superpowers/specs/2026-05-22-wave3-diners-comms-design.md §F.3.
 *
 * NB: inbound SMS handling (STOP keyword / opt-out) is deferred to a
 * Wave 4 follow-up — this route only handles outbound delivery status.
 */

import "server-only";
import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import twilio from "twilio";
import { dbAdmin } from "@/lib/db/admin";
import { transactionalEmailLog } from "@/lib/db/schema";
import { ingestWebhook, type VerifyResult } from "@/lib/webhooks/handle";

// Subset of valid transactional_email_log.sms_status values we set from
// the Twilio webhook. 'optout' is reserved for the inbound-SMS handler.
type MappedSmsStatus = "queued" | "sent" | "delivered" | "undelivered" | "failed";

function mapTwilioStatus(messageStatus: string): MappedSmsStatus | null {
  switch (messageStatus) {
    case "queued":
    case "sending":
    case "accepted":
    case "scheduled":
      return "queued";
    case "sent":
      return "sent";
    case "delivered":
    case "read":
      return "delivered";
    case "undelivered":
      return "undelivered";
    case "failed":
      return "failed";
    default:
      // Includes 'receiving' / 'received' (inbound), 'canceled', etc.
      return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const signature = request.headers.get("x-twilio-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 401 });
  }

  // Twilio webhooks are form-urlencoded. We consume the body once here —
  // we need the parsed params for both signature verification (Twilio
  // signs URL + sorted params) and for extracting MessageSid/Status.
  const rawBody = await request.text();
  const params = Object.fromEntries(
    new URLSearchParams(rawBody),
  ) as Record<string, string>;
  const fullUrl = request.url;

  if (!twilio.validateRequest(authToken, signature, fullUrl, params)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const messageSid = params.MessageSid;
  const messageStatus = params.MessageStatus;
  const errorCode = params.ErrorCode;
  const errorMessage = params.ErrorMessage;

  if (!messageSid || !messageStatus) {
    return NextResponse.json(
      { error: "missing message fields" },
      { status: 400 },
    );
  }

  // (MessageSid, MessageStatus) uniquely identifies a status transition.
  // Twilio retries reuse the same pair, so this dedupes through the
  // substrate's (provider, provider_event_id) unique index.
  const providerEventId = `${messageSid}:${messageStatus}`;

  const preVerified: VerifyResult = {
    ok: true,
    eventId: providerEventId,
    eventType: `sms.${messageStatus}`,
    payload: params,
  };

  return ingestWebhook({
    provider: "twilio",
    request,
    verifySignature: async () => preVerified,
    handle: async () => {
      const mapped = mapTwilioStatus(messageStatus);
      if (!mapped) return;

      const isFailure = mapped === "undelivered" || mapped === "failed";
      const failureReason = isFailure
        ? `${errorCode ?? "?"}: ${errorMessage ?? "Twilio error"}`
        : null;

      await dbAdmin
        .update(transactionalEmailLog)
        .set({
          smsStatus: mapped,
          statusUpdatedAt: new Date(),
          failureReason,
        })
        .where(eq(transactionalEmailLog.twilioMessageSid, messageSid));

      // Mirror onto marketing_sends for marketing SMS/WhatsApp (keyed on the
      // Twilio SID; a no-op for transactional messages). Previously marketing
      // delivery/failure state was never tracked.
      await dbAdmin.execute(sql`
        UPDATE marketing_sends SET
          status = CASE
            WHEN ${mapped} = 'delivered' THEN 'delivered'::marketing_send_status
            WHEN ${mapped} IN ('undelivered','failed') THEN 'failed'::marketing_send_status
            ELSE status END,
          delivered_at = CASE WHEN ${mapped} = 'delivered' THEN now() ELSE delivered_at END,
          failure_code = CASE WHEN ${isFailure} THEN ${errorCode ?? null} ELSE failure_code END,
          failure_message = CASE WHEN ${isFailure} THEN ${failureReason} ELSE failure_message END,
          status_updated_at = now()
        WHERE twilio_message_sid = ${messageSid}
      `);
    },
  });
}
