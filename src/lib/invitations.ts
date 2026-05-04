/**
 * Invitation token utilities.
 *
 * - Raw token is 32 bytes of crypto randomness, base64url-encoded (~43 chars)
 * - Only the sha256 hash of the token is ever stored in the DB
 * - The raw token only lives in the email link + the admin "copy URL" action
 */

import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { appOrigin } from "@/lib/app-origin";

export const INVITATION_TTL_DAYS = 14;

export function generateInvitationToken(): { raw: string; hash: string } {
  const raw = randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashInvitationToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function invitationUrl(rawToken: string): string {
  return `${appOrigin()}/onboard/${rawToken}`;
}

export function invitationExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + INVITATION_TTL_DAYS);
  return d;
}
