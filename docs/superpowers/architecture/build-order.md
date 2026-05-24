# Build Order — v1

> Canonical dependency order for executing the 16 architecture docs against the existing production codebase. **No durations.** Order only.

This doc is the bridge between the architecture spec (§00–§15) and the keyboard. Each wave is a dependency layer: everything inside a wave can be done in any order (or in parallel sessions); a wave only opens once the previous wave's outputs are in place.

When a wave's units are done, mark them off and move to the next wave. Don't reorder waves to chase quick wins — the ordering is load-bearing on cross-domain assumptions.

## How to use this doc

- **Pick the lowest open wave.** Don't start Wave N+1 until Wave N's units are all merged + on prod.
- **Within a wave, pick any unit.** Each unit is independently buildable against the architecture doc for that section.
- **The architecture doc is the spec.** This doc is the order. If they conflict, the architecture doc wins; update this doc to match.
- **Cross-references**: every unit has an anchor in the relevant architecture doc (§NN). Read that section before starting the unit.

## Two non-obvious dependency calls

1. **§02 audit-write retrofit lives in Wave 2, not later.** Retrofitting audit writes is cheap while §02 is still small; the longer we wait, the more new mutations accrue and the more painful the retrofit becomes. It rides with §01 organizations.
2. **§13 baseline sits in Wave 4, not Wave 9.** The cascade *closure* (verifying every domain has its handler) lives in Wave 9 — but the §13 *baseline* (data_subject_requests, retention_policies, cookie_consents, legal pages, rate_limits middleware) is independent of the rest and unblocks §11 rate limits + §15 cookie banner. It rides with §08 + §05 polish.

## Current state at start (2026-05-20)

Mapped against the 16 architecture docs:

| Status | Domain | Notes |
|---|---|---|
| Substantial | §02 Bookings | `reservations` + RLS + cron; needs audit hooks + slot-concurrency upgrade |
| Substantial | §05 Venue page | `restaurants` / photos / menus exist; missing `restaurant_translations` + EXIF stripping + tier limits |
| Substantial | §06 Reviews | Migrations 0006 + 0007 on prod |
| Substantial | §10 Corporate events | Migrations 0008 + 0010 + Phase 1.5 just shipped |
| Partial | §01 Identity | `profiles` + `invitations` exist; no `organizations`, no `restaurant_staff`, no `customer_type`, no MFA |
| Partial | §04 Communications | Resend + `partner_notifications` + 4 cron email routes; no `transactional_email_log`, no Twilio, no `ingestWebhook` |
| Partial | §14 Setup tooling | `draft_restaurants` exists; nothing else |
| Missing | §03 Diners | Entire CRM |
| Missing | §07 Analytics | None |
| Missing | §08 Tables | None |
| Missing | §09 Multi-location | Org concept doesn't exist |
| Missing | §11 Marketing | None |
| Missing | §12 Billing | None |
| Missing | §13 Compliance | None |
| Missing | §15 Pricing | None |

Also missing from foundations: `audit_logs` table, pg-boss, Stripe SDK, Twilio SDK, Sentry EU, OpenTelemetry, `webhook_events` table, the typed registries.

---

## Wave 1 — Foundation substrate

*Unblocks: every subsequent wave. These contracts are quoted by every domain.*

- [x] `audit_logs` table + `recordAudit` helper (foundations §17.12, §16.2) — migration 0011_audit_logs, src/lib/audit/record.ts
- [x] `ERROR_CODES` typed registry — `src/lib/errors/codes.ts` (foundations §16.1) — 54 TV codes + 7 cross-cutting, range/slug invariants tested
- [x] `AUDIT` typed registry — `src/lib/audit/actions.ts` (foundations §16.2) — shipped with the recordAudit helper since its TS signature depends on the registry
- [x] `JOBS` typed registry — `src/lib/jobs/keys.ts` (foundations §16.3) — full registry across 12 domains, prefix + uniqueness invariants tested
- [x] `ActionResult<T>` + `ok()` / `fail()` helpers (foundations §3.2) — src/lib/server-action.ts; covers ok/fail/invalid/unauthenticated/forbidden/notFound/conflict/rateLimited
- [x] `can()` / `requireCan()` permission framework (foundations §3.4) — full §01 §4.3 matrix in `src/lib/authz/permissions.ts` (31 actions × 6 matrix roles, every cell asserted in tests); `can()` + `requireCan()` in `src/lib/authz/can.ts` with swappable MembershipResolver. Default `legacyResolver` maps current-prod `restaurants.owner_user_id` → `venue_owner`; the §01 org-aware resolver replaces it in Wave 2 without changing call sites.
- [x] `webhook_events` table + `ingestWebhook` skeleton (foundations §6.6) — migration 0012_webhook_events on prod (bookkeeping row 13, sha256 3e2f2c4d23efe0d2); helper at src/lib/webhooks/handle.ts with 4 unit tests covering signature failure / dup / success / handler-throw paths
- [x] pg-boss install + worker process (foundations §17.7) — `pg-boss` installed; `src/lib/jobs/{boss,enqueue}.ts` provides singleton lifecycle + traceparent-stitched typed enqueue; `scripts/worker.ts` boots the worker (`npm run worker:start`, WORKER_MODE=true gate). Domain handler registration goes in the worker script's marked extension point. User must (1) provide `PGBOSS_DATABASE_URL` (direct Postgres, not pgbouncer), (2) deploy the worker as a second Coolify service pointing at the same image with `WORKER_MODE=true`.
- [x] Sentry EU project + DSN wired up (foundations §15a.8, §12.3) — `@sentry/nextjs` installed; sentry.server/edge/instrumentation-client configs wired with PII scrubbing per §12.1 (src/lib/sentry/scrub.ts, 4 unit tests). Env-gated: when SENTRY_DSN unset, init is a no-op. User still needs to (1) create EU-region Sentry project + provide DSN, (2) optionally provide SENTRY_AUTH_TOKEN for source-map upload.
- [x] OpenTelemetry baseline tracing (foundations §12.3) — `@vercel/otel` + `@opentelemetry/{api,sdk-logs,api-logs,instrumentation}` installed; `instrumentation.ts` registers OTel with service name (defaults to `tavli-web`). Exporter target attaches in the Sentry unit (§12.3)
- [x] Stripe SDK install + env config (foundations §17.8) — `stripe` installed; `src/lib/stripe/client.ts` provides `getStripe()` singleton + `verifyStripeSignature()` for §6.6 webhook ingest. Subscription/Checkout/SetupIntent logic lives in §12 (Wave 5). User must provide STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET.
- [x] Twilio SDK install + env config (foundations §17.7) — `twilio` installed; `src/lib/twilio/client.ts` provides `getTwilio()` singleton + `verifyTwilioSignature()`. SMS wrapper (E.164, quiet hours, STOP keyword) lives in §04 (Wave 3); WhatsApp wrapper in §11 (Wave 7). User must provide TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN (EU-region project).

## Wave 2 — Identity + bookings reconciliation

*Unblocks: §09, §12, §14, §15 (all need `organizations`). Retires §02's audit-debt.*

- [x] §01 `organizations` table + `organization_members` + `restaurant_staff` (migration 0013, src/lib/authz/resolvers/org.ts; orgResolver swapped in for legacyResolver. §3.6 column-ownership swap closed.) *(sub-unit A shipped 2026-05-21 — migration 0014 adds the columns with backfill + activates orgResolver cross-scope grant; sub-unit B shipped 2026-05-21 — 22 callsites moved off owner_user_id; sub-unit C shipped 2026-05-21 — migration 0015 drops owner_user_id + rewrites is_owner_of/claim_invitation + deletes legacyResolver)*
- [x] §01 `customer_type` enum + `tax_id` uniqueness enforcement *(shipped 2026-05-22 — migration 0017 adds `org_customer_type` enum + `organizations.customer_type` nullable column per §12 §4.1. tax_id uniqueness already shipped in 0014 sub-unit A. Deferrable check constraint waits for §12's subscriptions table.)*
- [x] §01 §3.5 `staff_invitations` table *(shipped 2026-05-22 — migration 0018: 2 enums + table + 4 FKs + 3 partial indexes + check constraint + 3 SELECT-only RLS policies. token_hash uses varchar(64) (existing-codebase convention) not the spec's bytea. The invitation FLOW — invite/claim/revoke/resend + email + `claim_staff_invitation` stored proc — is §01 §13 step 10, a separate future unit.)*
- [x] §01 MFA / passkeys (§01 §5.2) *(phase 2 shipped 2026-05-22 — /admin/security + /partner/security pages with editorial single-column layout, multi-step sign-in (password → TOTP / recovery code) on both /admin/sign-in and /partner/sign-in, forced enrolment for admins via proxy AAL gate, recovery codes (migration 0020 `mfa_recovery_codes` with sha-256 hex hashes + select-self RLS), Next-Action proxy bypass for server actions, password-change flow with transient anon-client re-auth, sign-out-everywhere CTA. Passkeys/WebAuthn deferred to v1.5.)*
- [x] §01 Tavli-admin support impersonation (§01 §5.3) *(phase 2 shipped 2026-05-22 — real-session-swap impersonation with AES-256-GCM-encrypted return-ticket cookie carrying admin tokens (4h TTL), /admin/users rich list with search + MFA badge + last-impersonated + audit drawer, ImpersonateModal with optional reason, persistent red banner in admin's hijacked session showing both emails + start-time + stop control, partner sign-out rerouted through `stopImpersonationSession` when impersonating, 7-site audit retrofit threading `impersonatorUserId` via `currentActor()` helper, AAL2 gate bypass during impersonation. Spec divergence: only admin's hijacked session sees the banner — partner's own concurrent sessions are unaffected (server-side notification flagged as v1.5).)*
- [x] §01 NIST 800-63B password policy + session revocation (§01 §5.1, §5a.4) *(shipped 2026-05-22 — `src/lib/auth/password-policy.ts` helper enforcing 8-char minimum + HIBP k-anonymity check; wired into onboard account creation; sign-in flows already uniform (Supabase Auth's generic error defeats email enumeration). Password-CHANGE flow + session-revocation wiring + audit row are part of the future `/partner/security` UI unit.)*
- [x] §02 audit-write retrofit on every reservation mutation *(shipped 2026-05-21 — `src/lib/audit/actor-role.ts` helper + recordAudit() wired into 6 reservation-mutation sites: public booking INSERT, partner status update, partner cancel, public consumer cancel via RPC, corporate accept → reservation INSERT, corporate event-request cancel cascade. Site 6 audit lives at the caller (`src/app/event-requests/[token]/actions.ts`) rather than the repo per Task 7's option-(b) recommendation.)*
- [x] §02 `bulkExportReservations` action (§02 §4.8) *(shipped 2026-05-21 — `src/app/partner/(dashboard)/reservations/export-actions.ts` server action returning base64-encoded CSV; date range + scope (restaurant or org) + `can('analytics.export')` gate + `AUDIT.analytics.export_run` audit. CSV-only for v1; XLSX deferred. UI download button is a future commit.)*
- [x] §02 slot concurrency safety (§02 §4.7) *(shipped 2026-05-21 via migration 0016: `FOR UPDATE` on `reservations_check_capacity()` trigger's availability SELECT. Deviates from spec's "new function" proposal in favor of trigger-level locking — protects all reservation INSERT paths uniformly; rationale in `docs/superpowers/specs/2026-05-21-slot-concurrency-design.md`.)*
- [x] §02 phone E.164 normalisation (§02 §4.7) *(shipped 2026-05-21 — `src/lib/phone/normalize.ts` helper using libphonenumber-js + 4 action-boundary wirings: public booking, event request, partner profile, onboard profile. Default country RO. Forward-only; legacy prod data stays as-typed.)*
- [x] §10 `companies` → `corporate_clients` consistency pass *(shipped 2026-05-22 — migration 0019: 3 tables + 2 enums + 1 column across 4 tables + 5 user-named indexes + 8 FK constraints + 3 RLS policies renamed in a single BEGIN/COMMIT block (all metadata-only RENAMEs, no data rewrite); Drizzle schema mirror updated; companies-repo.ts → corporate-clients-repo.ts + test renamed. Internal-only — user-facing copy ("Company name", "Companie", claimedCompany* form-field contract) deliberately preserved.)*

## Wave 3 — Diner CRM + comms upgrade

*Unblocks: §07 analytics, §11 marketing (both consume diners + comms). Lands the cascade leaves §13 needs.*

- [x] §03 `diners` table + acquisition source enum *(shipped 2026-05-23 — migration 0021 creates `diners` + `diner_acquisition_source` enum + 6 indices (incl. partial-unique on `(org, phone)` and `(org, lower(email))` that survive pseudonymisation) + 5 RLS policies (`admin_all` + `org_member_select` + `org_admin_write` + venue_staff policies appended in 0022 to avoid forward-column-ref). §03 §4.1. Migration 0022 adds `reservations.diner_id` + `reviews.diner_id` (both ON DELETE SET NULL). Build-order shorthand "diner_phone_links + diner_email_links" superseded by spec §4.1's partial-unique-index approach — no separate link tables.)*
- [x] §03 `findOrCreateDinerForReservation` helper *(shipped 2026-05-23 — `src/lib/diners/upsert.ts`. Phone-first then email-only paths; soft-updates email/name on match; restaurant country code resolved via cities join; integrated into `createReservation` after the reservation INSERT under service-role admin client, then UPDATEs reservation with `diner_id`. Diner upsert failures caught and logged so booking still confirms.)*
- [x] §03 `splitDiner` / `mergeDiner` actions *(shipped 2026-05-23 — `src/app/partner/(dashboard)/diners/actions.ts`. mergeDiners: cross-org rejected, profile union (arrays + jsonb shallow merge + longer notes), FK repointing for reservations + reviews, audit with currentActor threading. splitDiner: identity-collision rejected (mapped from partial-unique violation), cross-org rejected, reservations + reviews repointed to new diner inside a single transaction.)*
- [x] §03 anonymisation handler + `diner_pii_access_log` (§03 §8.2) *(shipped 2026-05-23 — migration 0023 creates `diner_pii_access_log` (RLS: admin_all + org_member_select; INSERT/UPDATE/DELETE via service-role only). `revealPiiBatch` helper inserts log rows BEFORE invoking loader (audit happens even if loader throws). `pseudonymiseDiner` writes `redacted_at` + nulls PII on diners + placeholder strings on reservations.guest_* + reviews.first_name (NOT NULL constraints preclude pure null — flagged for future schema relax) + nulls email/phone + sets `redacted_at` on `transactional_email_log` for that diner + writes `erasure_log` row + 2 audit rows (`diner.pseudonymised` + `compliance.erasure_executed`).)*
- [x] §04 `transactional_email_log` table *(shipped 2026-05-23 — migration 0026 creates a unified table with `channel` column ('email' | 'sms') and channel-specific status enums (`email_status` / `sms_status`) plus a CHECK constraint enforcing mutex per channel. 4 indices including partial-unique on Resend/Twilio message ids. RLS: admin_all + org_member_select_via_org_id_at_event; service-role writes. Build-order shorthand "+ sms_log" superseded by spec §5.1's unified-table approach — no separate sms_log table. `sendTransactionalEmail` wrapper at `src/lib/email/send-transactional.ts` accepts pre-rendered html/text/subject (pragmatic for v1 — defers full i18n catalogues to a later commit), logs queued→sent transition + bounces to failed on Resend error, honours `EMAIL_DEV_FORCED_RECIPIENT` + `PLATFORM_ORG_ID`. All 6 existing email send-sites refactored to use the wrapper.)*
- [x] §04 Resend webhook routed through `ingestWebhook` *(shipped 2026-05-23 — `src/app/api/webhooks/resend/route.ts`. Svix-style HMAC-SHA256 signature verification (svix-id / svix-timestamp / svix-signature headers); idempotency through the existing `ingestWebhook` substrate via `(provider='resend', provider_event_id=svix-id)`; status updates on email.{sent, delivered, bounced, complained, failed}; bounce + complaint events insert into `marketing_suppressions` with `source='bounce' | 'complaint'`.)*
- [x] §04 Twilio send + status webhook *(shipped 2026-05-23 — `src/lib/sms/send-transactional.ts` wrapper: E.164 normalisation (TV200), restaurant gate via `restaurants.transactional_sms_enabled` (TV201, migration 0027), consent check via `marketing_consents` for non-anonymous diners (TV202), suppression check via `marketing_suppressions` (TV203), 24h idempotency via prior sent row (short-circuits), TV205 on Twilio API error. `src/app/api/webhooks/twilio-sms-status/route.ts` Twilio status webhook: validates HMAC-SHA1 via `twilio.validateRequest`, routes through ingestWebhook with `(provider='twilio', eventId=${MessageSid}:${MessageStatus})`, maps Twilio statuses to enum, captures ErrorCode + ErrorMessage on undelivered/failed. Inbound STOP keyword handler deferred to Wave 4.)*
- [x] §04 `partner_notifications.pending_erasure` columns *(shipped 2026-05-23 — migration 0028 adds `pending_erasure_at` + `redacted_at` timestamptz columns. Cascade-fill logic deferred to Wave 4 §13 erasure cascade orchestrator.)*

**Foundations backfill shipped as part of Wave 3** (Wave 1 reference missed): migration 0024 `erasure_log` (foundations §15a.1 — service-role writes, admin-read + org-owner-select policies); migration 0025 `marketing_consents` + `marketing_suppressions` (foundations §4.7 — admin_all + org_member_select policies; channel CHECK constraints; case-insensitive unique on `marketing_suppressions(channel, lower(identifier))`).

## Wave 4 — Compliance baseline + horizontal infra

*Unblocks: §11 (rate limits), §15 (cookie banner). Closes the §13 baseline.*

- [x] §13 `data_subject_requests` + `retention_policies` + nightly purge job *(shipped 2026-05-23 — `data_subject_requests` table + RLS in sub-unit A (migration 0029, commit `b8f9133`); `retention_policies` table + 11-row v1 seed in sub-unit B (migration 0032 applied to prod with bookkeeping row 33, 5 live tables + 6 forward-declared future-wave that the job skips silently via `to_regclass`); `src/lib/compliance/retention.ts` purge engine (hard_delete chunked at 5000/transaction oldest-first; anonymise/archive_offline/exception_predicate as Wave-5/Wave-7-deferred throw-stubs); `JOBS.compliance.retentionPurge` registered at worker bootstrap + scheduled nightly 04:30 UTC (30min after `purgePseudonymised` 04:00 to avoid lock contention); identifier-validation regex hardens against future malformed seeds; recordAudit fires AFTER DELETE so audit_logs self-purge doesn't lose the per-policy summary. Reuses pre-existing AUDIT.compliance.retention_purge_run. First nightly run will actively purge webhook_events older than 90 days — intended. Sub-unit A.fix pass closed 12/13 findings from the final cross-cutting review including a GDPR-load-bearing PII leak (#5 — confirmation-email send moved BEFORE handler iteration so the new transactional_email_log row gets caught by handleDiners' cascade).)*
- [x] §13 `rate_limits` + `enforceRateLimit` middleware *(shipped 2026-05-23 — migration 0033 rate_limits table; `src/lib/rate-limit/scopes.ts` (8 scopes per §9.2); `src/lib/rate-limit/enforce.ts` atomic bucket-by-window upsert with `ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 RETURNING count`; `JOBS.compliance.purgeRateLimits` scheduled nightly 05:00 UTC. 12 tests.)*
- [x] §13 `cookie_consents` + banner UI + analytics gating *(shipped 2026-05-23 — migration 0034 cookie_consents table; recordCookieConsent + readActiveCookieConsent server actions; `<CookieBanner>` client component wired via /api/cookie-consent POST; useCookieConsent hook for analytics gating; 13-month expiry per CNIL; `JOBS.compliance.purgeCookieConsents` scheduled 05:30 UTC. 16 tests.)*
- [x] §13 legal pages (privacy, terms, cookies, ANPC, data-processing, imprint) *(shipped 2026-05-23 — 6 MDX-rendered legal pages under /(legal)/; LegalShell + DraftBanner; existing `src/content/legal/{ro,en}/` infrastructure extended with the 2 missing pages (data-processing + imprint) + `mdx-components.tsx` at project root; parity tests 6/6.)*
- [x] §13 erasure cascade orchestrator (calls §03 + §04 handlers) *(shipped 2026-05-23 — `src/lib/compliance/pii-table-registry.ts` as single source of truth for v1 PII tables; migrations 0029 `data_subject_requests` + 0030 backfills `redacted_at` on audit_logs/reservations/reviews + 0031 `partner_notifications.pending_erasure_request_id` FK; six handlers (marketing_suppressions, marketing_consents, partner_notifications phase 1 + phase 2, diners wrapping pseudonymiseDiner, audit_logs two-pass chunked); orchestrator `JOBS.compliance.erasureExecute` enqueues phase-2 + per-diner purge + sends `DataDeletionConfirmedEmail` (RO/EN/DE); nightly `erasureVerify` sweep (03:00 UTC) + daily `purgePseudonymised` sweep (04:00 UTC); six DSR server actions (createDsr/resolveDinerForDsr/verifyDsrIdentity/approveDsrErasure/rejectDsr/extendDsrDeadline) at `src/lib/compliance/dsr-actions.ts`; admin queue at `/admin/(gated)/gdpr-requests` with 6 modals; new TV codes 1100/1105/1107/1108; new audit actions `compliance.{dsr_*,dsr_cascade_*,erasure_verification_*}`; pseudonymiseDiner extended with SELECT-FOR-UPDATE idempotency guard + cascade `redacted_at` writes; integration test skipped by default (TEST_DATABASE_URL gate). Closes Wave 3 deferred follow-up: `JOBS.diner.purgePseudonymised` worker bootstrap now registered.)*
- [x] §08 `tables` + `table_combinations` + `walkin_queue` + state machine *(shipped 2026-05-23 — migration 0035: 3 enums + 5 tables (restaurant_table_sections, restaurant_tables, table_status_log, table_combinations, walkin_queue) + denorm-sync trigger; src/lib/tables/state-machine.ts (13 legal transitions); src/lib/tables/transitions.ts (transitionTableStatus with FOR UPDATE + CTE-based duration computation); reservations gains table_id + combination_id + auto_assigned + mutual-exclusion CHECK. 55 new tests. Real-time channel + auto-assignment heuristic + wait-time estimation deferred post-v1.)*
- [x] §08 floor plan editor + `table_status_log` *(shipped 2026-05-23 — migration 0036 venue-staff read RLS for §08 tables; src/lib/tables/actions.ts with 6 actions (create/update/archive Table + Section); /partner/(dashboard)/tables list view with add/edit/archive modals; AUDIT.table.* entries added. Number-input positioning (drag-drop floor plan canvas deferred post-v1). 19 new tests.)*
- [x] §05 `restaurant_translations` (RO + EN + DE per-locale) *(shipped 2026-05-23 — migration 0037: 5 translation tables; pickTranslationRow + loadRestaurantTranslation with row-level fallback (if any required-for-publication field is null, fall back to RO entirely). Partner translations editor UI deferred post-v1. 17 tests.)*
- [x] §05 EXIF stripping + per-tier photo/menu limits *(shipped 2026-05-23 — sharp installed; src/lib/photos/strip-exif.ts uses sharp.rotate().keepIccProfile() (v0.34 API); integrated into uploadRestaurantPhoto; src/lib/billing/subscription-stub.ts returns 'base' for every org (Wave 5 §12 replaces with real loadActiveSubscription); photo cap 50 → 20 (Base default). Menu cap deferred until multi-menu support ships. 8 new tests.)*
- [x] §06 reviews polish: `redacted_at`, `include_in_aggregate_rating`, `aggregate_consent_at` *(shipped 2026-05-23 — migration 0038 adds is_hidden + hidden_* + updated_at + revision + include_in_aggregate_rating + aggregate_consent_at columns to reviews + CHECK constraint reviews_gdpr_takedown_attribution; REPLACEs reviews_recompute_aggregate trigger to filter `is_hidden = false AND redacted_at IS NULL AND include_in_aggregate_rating = true`; src/lib/reviews/aggregate.ts exports setAggregateConsent. redacted_at already shipped in sub-unit A.T2. 4 new tests.)*
- [x] §06 DSA notice-and-action hooks (§15a.5) *(shipped 2026-05-23 — migration 0039 review_reports table; src/lib/reviews/moderation.ts (submitReport + upholdReport + dismissReport — tavli-admin only for resolve); POST /api/reviews/[id]/report rate-limited (5/IP/hour via review_report scope); minimal admin queue UI at /admin/(gated)/reviews/reports; AUDIT.review.report_* + TV406 registered. ReviewRemovedStatementEmail + internal-review surface + partner-portal review surface deferred post-v1. 12 new tests.)*

## Wave 5 — Multi-location + billing

*Unblocks: §07, §11, §14, §15 (all need the billing-tier signal from `loadActiveSubscription`).*

- [x] §09 `organizations.brand_primary` / `brand_secondary` columns *(shipped 2026-05-24 — Wave 5 sub-unit A; migration 0040 also added `max_venues` + `current_venue_count` app-managed counter)*
- [x] §09 `restaurants.archived_at` rollup + venue archival flow *(shipped 2026-05-24 — Wave 5 sub-unit A; `addVenueToOrg`/`removeVenueFromOrg`/`reactivateVenue` lib actions + app wrappers, `venue_addition_log` table, nightly `multilocation.reconcile-venue-count` job, forward-declared §12 billing-hook seam (`src/lib/billing/venue-hooks.ts`). archived_at read-path retrofit deferred to the venue-archival-UI wave; §09 §6 UX surfaces (org dashboard, venue switcher, add-venue wizard) not yet scheduled.)*
- [x] §12 Stripe products + prices seed script with `tax_behavior: 'exclusive'` assertion *(shipped 2026-05-24 — Wave 5 sub-unit B; `scripts/seed-stripe-prices.ts` + `npm run verify:stripe-prices` + `src/lib/billing/stripe-price-spec.ts` (tested core) + env-backed `price-ids.ts`. USER-run with STRIPE_SECRET_KEY, then set STRIPE_PRICE_* envs.)*
- [x] §12 `subscriptions` + `subscription_items` + `invoices` + `payment_methods` + `billing_audit_log` *(shipped 2026-05-24 — Wave 5 sub-unit B; migration 0041, 4 enums + re_trial_granted + 5 tables + RLS. billing_audit_log two-column org-id design. chk_active_org_has_customer_type enforced in W5-C startSubscription, not a DB trigger per §4.3.)*
- [x] §12 `startSubscription` (§12 §7.1) + day-91 PSD2/SCA conversion (§12 §7.3) *(shipped 2026-05-24 — Wave 5 sub-unit C; `src/lib/billing/start-subscription.ts` (Stripe Customer/Subscription/Checkout setup-mode + mirror rows + reminder enqueue + audit, factory-only/injected Stripe), `recordBillingAudit` writer, day-60/75/85 reminder jobs + `TrialEndingEmail`/`RecurringChargeConsentEmail` templates (RO/EN/DE), forward-declared `/onboard` trial-start seam (`maybeStartTrial`, no-ops until plan/customer_type capture). setup_intent.succeeded handler + PSD2-email SEND + status mirroring are W5-D; day-91 conversion is Stripe-native at trial_end.)*
- [ ] §12 Stripe webhook router with two-layer idempotency (§12 §6.3.1)
- [ ] §12 cancellation + pro-rata annual refund (§12 §10)
- [ ] §12 tier swap (Base ↔ Pro) + frequency switch deferred to period-end (§12 §8.2, §8.3)
- [ ] §12 per-additional-location quantity sync hook from §09 (§12 §8.1)
- [ ] §12 tiered dunning — day 0–6 full / day 7 soft-lock / day 21 read-only (§12 §11.5)
- [x] §12 `loadActiveSubscription` helper with React `cache()` memoization (§12 §3.5) *(shipped 2026-05-24 — Wave 5 sub-unit B; `src/lib/billing/load-subscription.ts` reads the subscriptions mirror, returns ActiveSubscriptionState|null, defensive (null on error, never throws). Replaced the Wave 4 subscription-stub; consumers (photos cap, venue-actions tier gate) updated to null→base. Returns null for every org until W5-C creates rows.)*

## Wave 6 — Analytics

*Unblocks: §11 (segmentation reads cohorts), §12 (overage reporting reads usage).*

- [ ] §07 aggregate + cohort tables
- [ ] §07 `JOBS.analytics.runExport` ZIP generation
- [ ] §07 Pro dashboards
- [ ] §07 PII access audit logging on every export (§07 §5a)
- [ ] §07 `analytics.weeklySummary` digest job

## Wave 7 — Marketing suite

*Unblocks: §12 overage billing (closes the loop). Final cross-domain integration of the diner / comms / billing / analytics surfaces.*

- [ ] §11 `marketing_campaigns` + `segments` + `sends` + `suppressions` + `consents` + `quotas`
- [ ] §11 fan-out job mesh: scheduled + triggered + per-recipient (§11 §14)
- [ ] §11 RFC 8058 unsubscribe + STOP suffix (foundations §6.5, §7.1)
- [ ] §11 WhatsApp Meta-verification gate — `TV904` (§11)
- [ ] §11 monthly overage feed → `JOBS.billing.reportMarketingOverage` (§12 §9.1)
- [ ] §11 `reservations.campaign_id` FK constraint (column owned by §02; constraint owned by §11)
- [ ] §11 cross-domain audit-key mapping (§11 §11.2 table)

## Wave 8 — Setup tooling + pricing page (parallel-friendly within wave)

*Unblocks: customer-acquisition surface + operator onboarding tooling.*

- [ ] §14 `setup_progress` table + creation trigger
- [ ] §14 `migration_imports` + CSV converter (manual template only for v1; per §14 §6.1)
- [ ] §14 founder admin "in-flight setups" dashboard
- [ ] §14 day-7 / day-30 / day-60 check-in emails
- [ ] §14 parallel-run consolidation flow + banner UI
- [ ] §15 `currency_reference_rates` + BNR XML fetcher + manual-override path
- [ ] §15 pricing page components (RO + EN + DE)
- [ ] §15 VAT disclosure panel (B2B / B2C / EU outside RO / outside EU)
- [ ] §15 day-91 card-on-file disclosure block
- [ ] §15 `prospect_waitlist` + wait-list mode toggle via `PARTNER_SIGNUP_ENABLED`
- [ ] §15 SEO + JSON-LD + hreflang per-locale
- [ ] §15 `frontend-design`-skill aesthetic pass (the editorial bar)

## Wave 9 — Closure

*Unblocks: launch.*

- [ ] §13 erasure-cascade verification — every domain handler integration-tested end-to-end
- [ ] Full integration sweep across audit cascade + dunning + GDPR + WhatsApp gate
- [ ] Lighthouse + axe-core + cross-browser pass on all public surfaces (§15a.7)
- [ ] ANPC + GDPR + PSD2 + DSA + WCAG 2.2 AA conformance audit checklist
- [ ] DKIM / SPF / DMARC warmup on the transactional sending domain
- [ ] DPAs signed with every sub-processor (Resend, Twilio, Stripe, Supabase, Cloudflare, Sentry); documented in `docs/operations/sub-processors.md`
- [ ] Stripe Tax registration in RO confirmed (§12 §3.6.4)
- [ ] Final smoke test against the standing test partner account

---

## Working pattern

For each unit, the loop is:

1. **Read** the architecture doc section for that unit (the §NN anchor on each line).
2. **Spike if uncertain** — the unit's contract may surface an assumption that needs a 1-shot prototype before deep build. Especially for §12 PSD2/SCA + §13 GDPR cascade + §11 WhatsApp gate.
3. **Migrate first** — schema migration as its own commit before any application code.
4. **Implement** — server actions, jobs, UI, tests.
5. **Wire the registries** — every new mutation writes `audit_logs` through the registered `AUDIT.<domain>.*` key; every new job lives under `JOBS.<domain>.*`; every new error code lives in `ERROR_CODES`.
6. **Cross-doc consistency check** — if a new column / job / audit key is added, verify it's reflected in foundations §16.

## Replan triggers (not replan dates)

This doc is the canonical order *as understood at 2026-05-20*. Update it when:

- A spike reveals an architectural assumption that needs revision (e.g., Stripe Tax behaves differently than §12 §3.6 assumes).
- A domain's scope materially shifts during build (new column ownership, new dependency surfaced).
- A unit is split or merged for tractability.
- The architecture doc set is updated.

When the doc updates, bump the date at the bottom and note the reason in a `## Revisions` section.

---

## Revisions

- **2026-05-20** — Wave 1 unit `audit_logs` table + `recordAudit` helper shipped together with the `AUDIT` typed registry. Reason: §16.2 specifies the helper's TypeScript signature is keyed by the registry, so they cannot ship apart cleanly. The other two Wave 1 items (`ERROR_CODES`, `JOBS`) remain independent and stay as separate units.
- **2026-05-21** — Wave 2 unit "§01 organizations + restaurant_staff" split: the three new tables (§3.2/§3.3/§3.4) + org-aware resolver shipped in migration 0013; §3.6 modifications (restaurants.organization_id, drop owner_user_id, profiles.default_organization_id) deferred to a follow-up unit because they require a backfill decision that's distinct from the new-table additions. Until §3.6 lands, the orgResolver covers venue scope via restaurant_staff and organization scope via organization_members but does not yet grant cross-scope access (org member → all org venues).
- **2026-05-21** — §01 §3.6 split into three sub-units. Sub-unit A (migration 0014) ships schema + backfill + resolver wiring; sub-units B (refactor 27 owner_user_id callsites) and C (drop owner_user_id) remain. See `docs/superpowers/specs/2026-05-21-org-ownership-swap-sub-unit-A-design.md`.
- **2026-05-21** — §01 §3.6 sub-unit B shipped: 22 partner/onboard callsites moved to currentUserPrimaryRestaurant() via the new `src/lib/restaurants/current-user.ts` helper (DI seam + per-request memoization); 4 authz sites (event_request.respond x1 in event-requests/actions.ts, restaurant.update x3 in photos/actions.ts) moved to can(). `defaultOrganizationId` now flows through `CurrentSession.profile`. Admin restaurant-detail page now surfaces org name + active-owner email instead of the raw owner_user_id. Sub-unit C (drop owner_user_id column + index) is now unblocked.
- **2026-05-21** — §01 §3.6 sub-unit C shipped: restaurants.owner_user_id dropped + is_owner_of/claim_invitation rewritten + legacyResolver retired. §3.6 trilogy complete. Migration 0015 wraps 5 phases in a single BEGIN/COMMIT: pre-flight assertion → is_owner_of rewrite (restaurant_staff ∪ organization_members) → claim_invitation rewrite (seeds orgs/staff instead of owner_user_id) → 11 DROP+CREATE policy rewrites across 0001/0002/0008/0010/0011 (inline owner_user_id checks replaced with public.is_owner_of(r.id)) → DROP COLUMN restaurants.owner_user_id. Drizzle schema mirror updated; 3 test fixtures cleaned.
- **2026-05-21** — §02 audit-write retrofit shipped (single commit). New helper `src/lib/audit/actor-role.ts` (DI seam + 5 unit tests) returns the user's highest-priority effective role (`tavli_admin > org_* > venue_* > diner`) so each audit row records the strongest authority the actor held. recordAudit() now stamps 6 reservation-mutation sites: public booking INSERT (anon → 'diner'), partner status update + partner cancel (sites 2/3), public consumer cancel via the confirmation-token RPC (anon → 'diner'), corporate accept → materialized reservation INSERTs (one audit per slot, atomic with the INSERT via the executor arg), and corporate event-request cancel cascade (consumer side, emits one audit per cascaded reservation). Site 6 lives at the caller per Task 7's option-(b) — repo stays session-free. No migration; pure code addition. Partner reservations test mock updated to stub `recordAudit` + `getActorRole` + return `organization_id: null` on the new restaurants lookup.

---

*Last updated: 2026-05-21. Initial draft after the architecture-doc perfection pass; first Wave 1 unit landed same day. Wave 2 §01 organizations + restaurant_staff unit landed 2026-05-21; §01 §3.6 sub-units A + B + C all landed 2026-05-21 — trilogy complete. §02 audit-write retrofit landed 2026-05-21.*
