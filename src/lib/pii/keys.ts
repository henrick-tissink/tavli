/**
 * Shared registry of object keys that must never reach logs, Sentry,
 * audit context, or any other observability surface. Single source of
 * truth so the Sentry scrub list (§12.1), the pino redact list (§12.2),
 * and the recordAudit context guard (§16.2) stay aligned.
 *
 * The list combines:
 * - Diner / guest PII (names, contact, free-text)
 * - Credentials + tokens
 * - Webhook signature secrets (not PII per se, but never to be logged)
 * - Payment surface (Stripe handles internally; we should never see them)
 *
 * FK ids (restaurant_id, reservation_id, diner_id, campaign_id, etc.)
 * are intentionally NOT in this list — they are the safe replacement.
 * Spec discipline: pass FK ids, not PII strings.
 *
 * Match is case-insensitive against the leaf key name. Add to this set
 * when a new PII-bearing column surfaces in a domain.
 */

export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  // Diner / guest identifiers
  "name",
  "fullname",
  "full_name",
  "first_name",
  "last_name",
  "phone",
  "email",
  "address",
  "billing_address",
  "guest_name",
  "guest_phone",
  "guest_email",
  "diner_name",
  "diner_phone",
  "diner_email",
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

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}
