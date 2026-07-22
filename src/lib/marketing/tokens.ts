/**
 * §11 §5.2 / §11.3 — HMAC tokens for unsubscribe (/u) + click-tracking (/c)
 * links. The payload binds (campaignId + dinerId + sendId) so a captured token
 * can't be replayed against a different send to the same diner. Click tokens
 * ADDITIONALLY bind the destination URL (`dst`) so a valid /c link can't be
 * replayed with an attacker-supplied ?dst= (open redirect). Unsubscribe tokens
 * have no destination and omit `dst` (the original 3-tuple).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.LINK_TRACKING_SECRET;
  if (s) return s;
  // Fail closed in production: a missing secret would make unsubscribe / click
  // tokens forgeable. Only fall back to the dev placeholder outside production.
  if (process.env.NODE_ENV === "production") {
    throw new Error("LINK_TRACKING_SECRET is required in production");
  }
  return "dev-link-tracking-secret";
}

export interface TokenPayload {
  campaignId: string;
  dinerId: string;
}

export function signSendToken(
  sendId: string,
  payload: TokenPayload,
  dst?: string,
): string {
  const base = `${payload.campaignId}:${payload.dinerId}:${sendId}`;
  // Click links pass the destination so it's bound into the signature; /u
  // unsubscribe links pass no dst and keep the original 3-tuple.
  const input = dst !== undefined ? `${base}:${dst}` : base;
  return createHmac("sha256", secret())
    .update(input)
    .digest("base64url")
    .slice(0, 32);
}

export function verifySendToken(
  sendId: string,
  token: string,
  payload: TokenPayload,
  dst?: string,
): boolean {
  const expected = signSendToken(sendId, payload, dst);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
