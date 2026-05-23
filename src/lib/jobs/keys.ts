/**
 * JOBS registry — single source of truth for every pg-boss job name.
 * Per foundations §16.3.
 *
 * Convention: `<domain>.<kebab-case-action>`. Names are stable contracts
 * between the enqueuer and the worker handler — renaming a key would
 * orphan any in-flight job rows in pg-boss. Adding a new job requires
 * an entry here first.
 *
 * pg-boss substrate itself is a separate Wave 1 unit; this registry
 * pre-declares every known job name so domain implementations import
 * the typed const rather than passing string literals.
 */

export const JOBS = {
  reservation: {
    sendReminder24h: "reservation.send-24h-reminder",
    sendPostVisitReview: "reservation.send-post-visit-review-request",
    autoMarkNoShow: "reservation.auto-mark-no-show",
  },
  marketing: {
    scheduledCampaignSend: "marketing.scheduled-campaign-send",
    fanOut: "marketing.triggered-campaign-fan-out",
    sendMessage: "marketing.send-message",
    suppressionPurge: "marketing.suppression-purge",
  },
  billing: {
    trialConversion: "billing.trial-conversion",
    sendReminderDay60: "billing.send-reminder-day-60",
    sendReminderDay75: "billing.send-reminder-day-75",
    sendReminderDay85: "billing.send-reminder-day-85",
    syncStripeSubscription: "billing.sync-stripe-subscription",
    reportMarketingOverage: "billing.report-marketing-overage",
    expireOrphanIncomplete: "billing.expire-orphan-incomplete",
    archiveCancelledOrgs: "billing.archive-cancelled-orgs",
    applyPendingFrequencyChanges: "billing.apply-pending-frequency-changes",
    enforceDunningTier: "billing.enforce-dunning-tier",
  },
  corporate: {
    leadRoutingNudge: "corporate.lead-routing-nudge",
    eventExpiry: "corporate.event-expiry",
  },
  // §09 §10. Doc spells the job "multi_location.*"; the registry invariant
  // (keys.test.ts) requires a single lowercase-word domain with no
  // underscores, so the value is "multilocation.*" to match every other key.
  multilocation: {
    reconcileVenueCount: "multilocation.reconcile-venue-count",
  },
  diner: {
    recomputeAggregates: "diner.recompute-aggregates",
    frequencyBucketRebalance: "diner.frequency-bucket-rebalance",
    purgePseudonymised: "diner.purge-pseudonymised",
  },
  analytics: {
    weeklySummary: "analytics.weekly-summary",
    refreshCohorts: "analytics.refresh-cohorts",
  },
  storage: {
    imageProcess: "storage.image-process",
    lifecycleSweep: "storage.lifecycle-sweep",
    videoEncode: "storage.video-encode",
  },
  webhook: {
    reingestUnprocessed: "webhook.reingest-unprocessed",
  },
  setup: {
    runMigrationImport: "setup.run-migration-import",
    flagAtRiskOrgs: "setup.flag-at-risk-orgs",
    sendDay7Checkin: "setup.send-day-7-checkin",
    sendDay30Checkin: "setup.send-day-30-checkin",
    sendDay60Checkin: "setup.send-day-60-checkin",
  },
  pricing: {
    refreshCurrencyRates: "pricing.refresh-currency-rates",
  },
  compliance: {
    erasureExecute: "compliance.erasure-execute",
    erasurePartnerNotificationsPhase2: "compliance.erasure-partner-notifications-phase-2",
    erasureVerify: "compliance.erasure-verify",
    retentionPurge: "compliance.retention-purge",
    dsarExport: "compliance.dsar-export",
    fullOrgExport: "compliance.full-org-export",
    autoRejectUnverified: "compliance.auto-reject-unverified",
    flagOverdueRequests: "compliance.flag-overdue-requests",
    purgeRateLimits: "compliance.purge-rate-limits",
    purgeCookieConsents: "compliance.purge-cookie-consents",
    gdprOtpVerify: "compliance.gdpr-otp-verify",
    retryAuthDeletion: "compliance.retry-auth-deletion",
  },
  identity: {
    expireStaleInvitations: "identity.expire-stale-invitations",
    purgeStaleUnverifiedOrgs: "identity.purge-stale-unverified-orgs",
  },
} as const;

// ─── Derived types ─────────────────────────────────────────────────────────

// Distributive mapped type so the union flattens across domains rather
// than intersecting on `keyof` (the empty intersection of per-domain
// keys collapses to `never`).
export type JobKey = {
  [D in keyof typeof JOBS]: (typeof JOBS)[D][keyof (typeof JOBS)[D]];
}[keyof typeof JOBS];
