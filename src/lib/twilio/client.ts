/**
 * Twilio SDK singleton per foundations §17.7.
 *
 * Substrate only — the SMS wrapper (E.164 normalisation, per-locale
 * quiet hours, STOP-keyword inbound handler) and the WhatsApp wrapper
 * live in §04 / §11 (Wave 3/7). Here we just construct the typed client
 * and expose webhook-signature verification for the §6.6 ingest flow.
 *
 * Twilio doesn't expose a "region" SDK option — region (EU/Ireland) is
 * a property of the project itself. Make sure the user's TWILIO_ACCOUNT_SID
 * belongs to a project provisioned in EU per foundations §15a.8.
 */

import "server-only";
import twilio from "twilio";
import type { Twilio } from "twilio";

let twilioInstance: Twilio | null = null;

export function getTwilio(): Twilio {
  if (twilioInstance) return twilioInstance;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error(
      "TWILIO_ACCOUNT_SID and/or TWILIO_AUTH_TOKEN missing. Both are " +
        "required to construct the Twilio client.",
    );
  }
  twilioInstance = twilio(sid, token);
  return twilioInstance;
}

/**
 * Verify an inbound Twilio webhook signature. Twilio signs the full
 * request URL + the request body's form-encoded params with the
 * account auth token (HMAC-SHA1). The §6.6 ingestWebhook wrapper
 * calls this from inside its verifySignature callback.
 */
export function verifyTwilioSignature(opts: {
  url: string;
  signatureHeader: string;
  params: Record<string, string>;
}): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    throw new Error(
      "TWILIO_AUTH_TOKEN missing — cannot verify inbound webhook signature.",
    );
  }
  return twilio.validateRequest(
    token,
    opts.signatureHeader,
    opts.url,
    opts.params,
  );
}
