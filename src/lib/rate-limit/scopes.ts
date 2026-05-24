/**
 * Rate-limit scope definitions — §13 §9.2 Wave 4 sub-unit C.
 *
 * Each scope names a window (in seconds) and the maximum count allowed
 * within that window. enforceRateLimit derives limit + windowSeconds from
 * the scope key; explicit overrides are only for tests.
 */

export const RATE_LIMIT_SCOPES = {
  widget_booking: { limit: 30, windowSeconds: 300 },
  widget_slot_lookup: { limit: 200, windowSeconds: 300 },
  login_attempt_per_email: { limit: 10, windowSeconds: 900 },
  login_attempt_per_ip: { limit: 30, windowSeconds: 900 },
  consent_import: { limit: 5, windowSeconds: 86400 },
  public_search: { limit: 60, windowSeconds: 60 },
  review_report: { limit: 5, windowSeconds: 3600 },
  gdpr_otp_verify: { limit: 5, windowSeconds: 300 },
  // §15 §18 OQ8 — pricing-page wait-list join. 1/email/day, 10/ip/day.
  pricing_waitlist_join_per_email: { limit: 1, windowSeconds: 86400 },
  pricing_waitlist_join_per_ip: { limit: 10, windowSeconds: 86400 },
} as const;

export type RateLimitScope = keyof typeof RATE_LIMIT_SCOPES;
