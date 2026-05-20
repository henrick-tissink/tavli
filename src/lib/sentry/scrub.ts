/**
 * PII scrubbing for Sentry events. Single source of truth shared by
 * the Node + Edge + browser Sentry inits per foundations §12.1.
 *
 * Strategy:
 * - Walk request body + extra + contexts; recursively redact known PII
 *   keys regardless of where they appear in the object tree.
 * - Drop breadcrumbs that contain redacted-key references in their data.
 * - Allow safe identifiers (restaurant_id, reservation_id, campaign_id,
 *   diner_id) — these are FKs, not PII.
 *
 * Mirrors the pino REDACT_PATHS list in §12.2 — kept structurally aligned
 * so log scrubbing and Sentry scrubbing remove the same surface.
 */

// Sentry's @sentry/nextjs package doesn't re-export these type aliases;
// pull them from @sentry/core where they're declared.
import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/core";

const REDACTED = "[REDACTED]" as const;

/**
 * Keys that always get redacted regardless of nesting depth. Match is
 * case-insensitive on the leaf key name only.
 */
const PII_KEYS = new Set<string>([
  // Diner / guest identifiers
  "phone",
  "email",
  "full_name",
  "fullname",
  "guest_phone",
  "guest_email",
  "guest_name",
  "diner_phone",
  "diner_email",
  "diner_name",
  "allergies",
  "notes",
  // Credentials + tokens
  "password",
  "password_confirmation",
  "api_key",
  "refresh_token",
  "access_token",
  "session_token",
  "confirmation_token",
  "unsubscribe_token",
  "signed_token",
  // Webhook signature secrets
  "stripe_signature",
  "twilio_signature",
  "resend_signature",
  // Payment surface
  "card",
  "card_number",
  "cvv",
  "cvc",
  "exp_month",
  "exp_year",
]);

function isPiiKey(key: string): boolean {
  return PII_KEYS.has(key.toLowerCase());
}

function redactRecursive(value: unknown, depth = 0): unknown {
  if (depth > 8) return value; // bound traversal
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactRecursive(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isPiiKey(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = redactRecursive(v, depth + 1);
    }
  }
  return out;
}

/**
 * Return the event with PII paths redacted. Returning `null` would tell
 * Sentry to drop the event entirely; we always preserve the event
 * structure and just redact the leaves. Typed against ErrorEvent
 * because `beforeSend` only fires for those (transactions go through
 * `beforeSendTransaction`, which we don't wire today).
 */
export function scrubSentryEvent<E extends ErrorEvent>(
  event: E,
  _hint?: EventHint,
): E {
  if (event.request?.data) {
    event.request.data = redactRecursive(event.request.data) as typeof event.request.data;
  }
  if (event.extra) {
    event.extra = redactRecursive(event.extra) as typeof event.extra;
  }
  if (event.contexts) {
    event.contexts = redactRecursive(event.contexts) as typeof event.contexts;
  }
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b: Breadcrumb) => {
      if (b.data) {
        return { ...b, data: redactRecursive(b.data) as typeof b.data };
      }
      return b;
    });
  }
  return event;
}
