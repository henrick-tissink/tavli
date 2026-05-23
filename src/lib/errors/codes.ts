/**
 * ERROR_CODES registry — single source of truth for every TV<NNN> error
 * code surfaced across the 16 domain docs. Per foundations §16.1.
 *
 * Per-domain ranges (the partition is contractual; never reuse a range):
 *   §02 Bookings       TV001–TV099
 *   §03 Diners         TV100–TV199
 *   §04 Comms          TV200–TV299
 *   §05 Venue page     TV300–TV399
 *   §06 Reviews        TV400–TV499
 *   §07 Analytics      TV500–TV599
 *   §08 Tables         TV600–TV699
 *   §09 Multi-loc      TV700–TV799
 *   §10 Corp events    TV800–TV899
 *   §11 Marketing      TV900–TV999
 *   §12 Billing        TV1000–TV1099
 *   §13 Compliance     TV1100–TV1199
 *   §14 Setup          TV1200–TV1299
 *   §15 Pricing        TV1300–TV1399
 *   §01 Identity       TV1400–TV1499
 *
 * `slug` is the i18n key suffix (machine-readable). It is distinct from
 * the human-readable `ActionResult.message` fallback string. Same slug
 * may appear under different codes when the same condition is detected
 * in different domains (e.g. trial_already_used surfaces in both §12
 * billing and §01 identity signup).
 *
 * Adding a code requires updating this registry first.
 */

export const ERROR_CODES = {
  // §02 Bookings (TV001–TV099)
  TV001: { domain: "02", slug: "no_availability" },
  TV002: { domain: "02", slug: "slot_full" },
  TV003: { domain: "02", slug: "modification_window_closed" },
  TV004: { domain: "02", slug: "capacity_override_denied" },
  TV005: { domain: "02", slug: "restaurant_not_found" },
  TV006: { domain: "02", slug: "outside_booking_window" },
  TV007: { domain: "02", slug: "already_terminal" },
  TV008: { domain: "02", slug: "token_invalid" },
  TV009: { domain: "02", slug: "identity_field_change_blocked" },

  // §03 Diners (TV100–TV199)
  TV101: { domain: "03", slug: "phone_or_email_required" },
  TV102: { domain: "03", slug: "identity_field_not_editable_by_venue_staff" },
  TV103: { domain: "03", slug: "diner_pseudonymised" },

  // §04 Communications (TV200–TV299)
  TV201: { domain: "04", slug: "no_transactional_channel_opted_in" },

  // §05 Venue page (TV300–TV399)
  TV301: { domain: "05", slug: "tier_limit_reached_photos" },
  TV302: { domain: "05", slug: "tier_limit_reached_menus" },

  // §06 Reviews (TV400–TV499)
  TV401: { domain: "06", slug: "already_reviewed" },
  TV402: { domain: "06", slug: "review_window_expired" },
  TV403: { domain: "06", slug: "edit_window_closed" },
  TV404: { domain: "06", slug: "review_hidden" },
  TV405: { domain: "06", slug: "comment_too_short" },

  // §07 Analytics (TV500–TV599)
  TV501: { domain: "07", slug: "export_too_large" },
  TV502: { domain: "07", slug: "no_data_in_window" },

  // §08 Tables (TV600–TV699)
  TV601: { domain: "08", slug: "invalid_transition" },
  TV602: { domain: "08", slug: "combination_exceeds_capacity" },
  TV603: { domain: "08", slug: "table_not_found" },

  // §09 Multi-location (TV700–TV799)
  TV701: { domain: "09", slug: "multi_venue_upgrade_required" },

  // §10 Corporate events (TV800–TV899)
  TV801: { domain: "10", slug: "no_matching_venues" },
  TV802: { domain: "10", slug: "quote_expired" },
  TV803: { domain: "10", slug: "deposit_requires_stripe_connect" },

  // §11 Marketing (TV900–TV999)
  TV901: { domain: "11", slug: "quota_exceeded" },
  TV902: { domain: "11", slug: "template_rejected_meta" },
  TV903: { domain: "11", slug: "consent_required" },
  TV904: { domain: "11", slug: "whatsapp_not_enabled" },

  // §12 Billing (TV1000–TV1099)
  TV1001: { domain: "12", slug: "trial_already_used" },
  TV1002: { domain: "12", slug: "tax_id_already_claimed" },
  TV1003: { domain: "12", slug: "card_declined" },
  TV1004: { domain: "12", slug: "vies_validation_failed" },
  TV1005: { domain: "12", slug: "downgrade_blocked_venue_count" },
  TV1006: { domain: "12", slug: "subscription_authentication_required" },

  // §13 Compliance (TV1100–TV1199)
  TV1100: { domain: "13", slug: "dsr_not_found" },
  TV1101: { domain: "13", slug: "identity_not_verified" },
  TV1102: { domain: "13", slug: "rate_limit_exceeded" },
  TV1103: { domain: "13", slug: "gdpr_deadline_extension_capped" },
  TV1104: { domain: "13", slug: "processing_restricted" },
  TV1105: { domain: "13", slug: "dsr_wrong_status" },
  TV1107: { domain: "13", slug: "deadline_extension_missing_reason" },
  TV1108: { domain: "13", slug: "dsr_diner_not_resolved" },

  // §14 Setup (TV1200–TV1299)
  TV1201: { domain: "14", slug: "migration_source_unsupported" },
  TV1202: { domain: "14", slug: "migration_row_invalid" },
  TV1203: { domain: "14", slug: "migration_file_too_large" },
  TV1204: { domain: "14", slug: "setup_step_unknown" },
  TV1205: { domain: "14", slug: "setup_step_transition_invalid" },

  // §15 Pricing (TV1300–TV1399)
  TV1301: { domain: "15", slug: "waitlist_email_already_pending" },
  TV1302: { domain: "15", slug: "bnr_rate_stale_critical" },

  // §01 Identity (TV1400–TV1499)
  TV1401: { domain: "01", slug: "trial_already_used" },
  TV1402: { domain: "01", slug: "org_not_verified" },
  TV1403: { domain: "01", slug: "tax_id_already_claimed" },
  TV1404: { domain: "01", slug: "invitation_expired" },
  TV1405: { domain: "01", slug: "invitation_already_claimed" },
} as const;

// ─── Derived types ─────────────────────────────────────────────────────────

export type DomainErrorCode = keyof typeof ERROR_CODES;

/**
 * Cross-cutting codes (no `TV` prefix) per foundations §3.2 + §16.1.
 * Returned by the shared `ok()` / `fail()` helpers in src/lib/server-action.ts.
 */
export type CrossCuttingErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "invalid_input"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

export type ActionErrorCode = DomainErrorCode | CrossCuttingErrorCode;
