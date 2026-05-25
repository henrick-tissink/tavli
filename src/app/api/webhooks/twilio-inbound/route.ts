/**
 * POST /api/webhooks/twilio-inbound — §04 §5.3 inbound SMS opt-out/opt-in.
 *
 * Twilio inbound-message webhook. Verifies X-Twilio-Signature (HMAC-SHA1 of URL
 * + sorted params) via twilio.validateRequest, then routes STOP/START keywords
 * through handleInboundSms (global SMS suppression / lift + consent revoke).
 * Responds with empty TwiML so Twilio's own Advanced Opt-Out messaging (if
 * enabled) or none is used — we don't inject our own auto-reply.
 *
 * Legally required the moment SMS sending is enabled (opt-out honouring).
 */
import "server-only";
import { NextResponse } from "next/server";
import twilio from "twilio";
import { handleInboundSms } from "@/lib/sms/handle-inbound";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(request: Request): Promise<Response> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return NextResponse.json({ error: "not configured" }, { status: 500 });

  const signature = request.headers.get("x-twilio-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 401 });

  const rawBody = await request.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>;
  if (!twilio.validateRequest(authToken, signature, request.url, params)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const from = params.From;
  const body = params.Body ?? "";
  if (from) {
    try {
      await handleInboundSms({ from, body });
    } catch (e) {
      console.error("[twilio-inbound] handler failed", e);
    }
  }
  return new NextResponse(EMPTY_TWIML, {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}
