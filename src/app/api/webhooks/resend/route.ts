/**
 * POST /api/webhooks/resend
 *
 * Resend uses Svix-style webhooks: `svix-id`, `svix-timestamp`,
 * `svix-signature` headers. We verify HMAC-SHA256 over
 * `${svix-id}.${svix-timestamp}.${raw-body}` using the configured secret.
 *
 * On valid signature, route through the shared `ingestWebhook` substrate
 * (provides idempotency via unique (provider, provider_event_id)).
 *
 * Side effects in the handle() callback:
 *   - email.sent/delivered/bounced/complained/failed → update
 *     `transactional_email_log.email_status` for the matching
 *     `resend_message_id`.
 *   - email.bounced → insert marketing_suppressions row (source=bounce).
 *   - email.complained → insert marketing_suppressions row (source=complaint).
 *
 * Spec: docs/superpowers/specs/2026-05-22-wave3-diners-comms-design.md §E.4.
 */

import "server-only";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { transactionalEmailLog, marketingSuppressions } from "@/lib/db/schema";
import { ingestWebhook, type VerifyResult } from "@/lib/webhooks/handle";

interface ResendEventPayload {
  type: string;
  data?: {
    email_id?: string;
    to?: string[];
    bounce?: { message?: string };
  };
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const signatureHeader =
    request.headers.get("svix-signature") ??
    request.headers.get("resend-signature");
  if (!svixId || !svixTimestamp || !signatureHeader) {
    return NextResponse.json(
      { error: "missing svix headers" },
      { status: 401 },
    );
  }

  // Body is consumed once. The shared `ingestWebhook` substrate exposes a
  // `verifySignature(request)` hook, but for Resend we already have the raw
  // bytes here (needed for the HMAC). We pre-verify and pass a constant
  // verifier into ingestWebhook so the substrate's idempotency + dedup logic
  // is reused unchanged.
  const raw = await request.text();

  if (!verifySvixSignature(secret, svixId, svixTimestamp, raw, signatureHeader)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: ResendEventPayload;
  try {
    payload = JSON.parse(raw) as ResendEventPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const messageId = payload.data?.email_id;
  const eventType = payload.type;

  // Reuse `svix-id` as provider_event_id — Svix guarantees per-event
  // uniqueness, and Resend's payload `id` is the same value.
  const providerEventId = svixId;

  const preVerified: VerifyResult = {
    ok: true,
    eventId: providerEventId,
    eventType,
    payload,
  };

  return ingestWebhook({
    provider: "resend",
    request,
    verifySignature: async () => preVerified,
    handle: async (event) => {
      const evtType = event.type;
      if (!messageId) return;

      const newStatus = mapResendEventToStatus(evtType);
      if (newStatus) {
        await dbAdmin
          .update(transactionalEmailLog)
          .set({
            emailStatus: newStatus,
            statusUpdatedAt: new Date(),
            failureReason: payload.data?.bounce?.message ?? null,
          })
          .where(eq(transactionalEmailLog.resendMessageId, messageId));
      }

      if (evtType === "email.bounced" || evtType === "email.complained") {
        const recipient = payload.data?.to?.[0];
        if (recipient) {
          await dbAdmin
            .insert(marketingSuppressions)
            .values({
              channel: "email",
              identifier: recipient,
              source: evtType === "email.bounced" ? "bounce" : "complaint",
              reason: payload.data?.bounce?.message ?? null,
            })
            .onConflictDoNothing();
        }
      }
    },
  });
}

function mapResendEventToStatus(type: string): string | null {
  switch (type) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.failed":
      return "failed";
    case "email.delivery_delayed":
      return null; // informational; no status change
    default:
      return null;
  }
}

function verifySvixSignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  body: string,
  signatureHeader: string,
): boolean {
  const signedPayload = `${svixId}.${svixTimestamp}.${body}`;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", secretBytes)
    .update(signedPayload)
    .digest();

  // svix-signature header: "v1,<base64sig> v1,<base64sig>" (space-separated,
  // allows multiple signatures during secret rotation).
  const signatures = signatureHeader
    .split(" ")
    .map((s) => s.split(",")[1])
    .filter(Boolean);

  for (const sig of signatures) {
    try {
      const sigBytes = Buffer.from(sig, "base64");
      if (
        sigBytes.length === expected.length &&
        timingSafeEqual(sigBytes, expected)
      ) {
        return true;
      }
    } catch {
      // malformed signature; try the next one
    }
  }
  return false;
}
