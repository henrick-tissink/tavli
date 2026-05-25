/**
 * AUDIT registry — single source of truth for every `audit_logs.action` string.
 *
 * Per foundations §16.2: new actions go here first; `recordAudit()` accepts
 * only registered keys. Naming convention is `<domain>.<entity>.<verb>`,
 * lower-snake-case. Never rename — historical queries depend on stable strings.
 *
 * Many domains below are not yet built (organizations, diners, marketing,
 * billing, etc. — see build-order.md). Their action keys are pre-registered
 * so domain implementations import-and-use rather than registering on the fly.
 */

export const AUDIT = {
  auth: {
    signin_succeeded: "auth.signin_succeeded",
    signin_failed: "auth.signin_failed",
    signout: "auth.signout",
    password_reset_requested: "auth.password_reset_requested",
    password_reset_completed: "auth.password_reset_completed",
    mfa_enrolled: "auth.mfa_enrolled",
    mfa_disabled: "auth.mfa_disabled",
  },
  user: {
    created: "user.created",
    erased: "user.erased",
    role_changed: "user.role_changed",
    impersonation_started: "user.impersonation_started",
    impersonation_ended: "user.impersonation_ended",
    signed_out_everywhere: "user.signed_out_everywhere",
    mfa_recovery_codes_regenerated: "user.mfa_recovery_codes_regenerated",
    mfa_recovery_code_consumed: "user.mfa_recovery_code_consumed",
  },
  organization: {
    created: "organization.created",
    updated: "organization.updated",
    merged: "organization.merged",
    member_invited: "organization.member_invited",
    member_joined: "organization.member_joined",
    member_removed: "organization.member_removed",
  },
  restaurant: {
    created: "restaurant.created",
    updated: "restaurant.updated",
    published: "restaurant.published",
    archived: "restaurant.archived",
    staff_invited: "restaurant.staff_invited",
    staff_added: "restaurant.staff_added",
    staff_removed: "restaurant.staff_removed",
  },
  reservation: {
    created: "reservation.created",
    modified: "reservation.modified",
    cancelled: "reservation.cancelled",
    capacity_overridden: "reservation.capacity_overridden",
    table_auto_cleared: "reservation.table_auto_cleared",
  },
  diner: {
    updated: "diner.updated",
    merged: "diner.merged",
    split: "diner.split",
    pii_accessed: "diner.pii_accessed",
    pseudonymised: "diner.pseudonymised",
    deleted: "diner.deleted",
  },
  review: {
    submitted: "review.submitted",
    edited: "review.edited",
    responded: "review.responded",
    response_edited: "review.response_edited",
    hidden: "review.hidden",
    reported: "review.reported",
    aggregate_consent_changed: "review.aggregate_consent_changed",
    report_submitted: "review.report_submitted",
    report_upheld: "review.report_upheld",
    report_dismissed: "review.report_dismissed",
  },
  table: {
    created: "table.created",
    updated: "table.updated",
    archived: "table.archived",
    status_changed: "table.status_changed",
    combination_created: "table.combination_created",
    combination_dissolved: "table.combination_dissolved",
    section_created: "table.section_created",
    section_updated: "table.section_updated",
    section_deleted: "table.section_deleted",
  },
  walkin: {
    added: "walkin.added",
    called: "walkin.called",
    seated: "walkin.seated",
    left: "walkin.left",
  },
  analytics: {
    export_run: "analytics.export_run",
    cohort_manually_overridden: "analytics.cohort_manually_overridden",
    weekly_summary_sent: "analytics.weekly_summary_sent",
  },
  marketing: {
    campaign_created: "marketing.campaign_created",
    campaign_edited: "marketing.campaign_edited",
    campaign_paused: "marketing.campaign_paused",
    campaign_archived: "marketing.campaign_archived",
    campaign_sent: "marketing.campaign_sent",
    segment_created: "marketing.segment_created",
    segment_edited: "marketing.segment_edited",
    suppression_added: "marketing.suppression_added",
    consent_captured: "marketing.consent_captured",
    consent_revoked: "marketing.consent_revoked",
  },
  billing: {
    subscription_created: "billing.subscription_created",
    subscription_updated: "billing.subscription_updated",
    subscription_upgraded: "billing.subscription_upgraded",
    subscription_cancelled: "billing.subscription_cancelled",
    frequency_change_requested: "billing.frequency_change_requested",
    frequency_changed: "billing.frequency_changed",
    payment_succeeded: "billing.payment_succeeded",
    payment_failed: "billing.payment_failed",
    refund_issued: "billing.refund_issued",
    setup_intent_succeeded: "billing.setup_intent_succeeded",
    psd2_consent_captured: "billing.psd2_consent_captured",
    dispute_opened: "billing.dispute_opened",
  },
  webhook: {
    received: "webhook.received",
    handler_failed: "webhook.handler_failed",
    reingested: "webhook.reingested",
  },
  setup: {
    step_transitioned: "setup.step_transitioned",
    migration_started: "setup.migration_started",
    migration_completed: "setup.migration_completed",
    migration_rolled_back: "setup.migration_rolled_back",
    parallel_run_consolidated: "setup.parallel_run_consolidated",
  },
  pricing: {
    waitlist_email_added: "pricing.waitlist_email_added",
    waitlist_email_invited: "pricing.waitlist_email_invited",
    rate_override_set: "pricing.rate_override_set",
    rate_stale_critical: "pricing.rate_stale_critical",
  },
  compliance: {
    gdpr_request_received: "compliance.gdpr_request_received",
    gdpr_deadline_extended: "compliance.gdpr_deadline_extended",
    gdpr_request_auto_rejected: "compliance.gdpr_request_auto_rejected",
    gdpr_otp_verify: "compliance.gdpr_otp_verify",
    erasure_executed: "compliance.erasure_executed",
    dsr_created: "compliance.dsr_created",
    dsr_resolved: "compliance.dsr_resolved",
    dsr_identity_verified: "compliance.dsr_identity_verified",
    dsr_approved: "compliance.dsr_approved",
    dsr_rejected: "compliance.dsr_rejected",
    dsr_extended: "compliance.dsr_extended",
    dsr_cascade_executed: "compliance.dsr_cascade_executed",
    dsr_cascade_failed: "compliance.dsr_cascade_failed",
    erasure_verification_passed: "compliance.erasure_verification_passed",
    erasure_verification_failed: "compliance.erasure_verification_failed",
    retention_purge_run: "compliance.retention_purge_run",
    dsar_exported: "compliance.dsar_exported",
    cookie_consent_granted: "compliance.cookie_consent_granted",
    cookie_consent_revoked: "compliance.cookie_consent_revoked",
    processing_restricted: "compliance.processing_restricted",
  },
} as const;

// ─── Derived types ─────────────────────────────────────────────────────────

// Distributive mapped type: for each domain key D, take the union of its
// action values, then flatten across domains. A naïve `keyof` would
// intersect keys across domains (yielding `never` since domains share no
// keys), so we map then index instead.
export type AuditAction = {
  [D in keyof typeof AUDIT]: (typeof AUDIT)[D][keyof (typeof AUDIT)[D]];
}[keyof typeof AUDIT];

/**
 * Granular per §01 permission matrix. `system` is for pg-boss jobs,
 * webhook handlers, and cron — i.e. writes with no human actor.
 *
 * Vocabulary aligns with `MatrixRole` in src/lib/authz/permissions.ts
 * (one source of truth for "what role is this user, right now, in this
 * subject's scope"). The §16.2 spec previously used `restaurant_*`;
 * unified on `venue_*` 2026-05-21 to match the authz matrix and avoid
 * a hand-mapping layer between can() and recordAudit.
 *
 * Org-scoped roles (org_*) and venue staff (venue_manager, venue_host)
 * become meaningful only once §01 ships `organizations` +
 * `restaurant_staff`. Until then callers will use `tavli_admin`,
 * `venue_owner`, `diner`, or `system`.
 */
export type ActorRole =
  | "tavli_admin"
  | "org_owner"
  | "org_admin"
  | "org_manager"
  | "venue_owner"
  | "venue_manager"
  | "venue_host"
  | "diner"
  | "system";
