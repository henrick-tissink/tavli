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
- [ ] `can()` / `requireCan()` permission framework (foundations §3.4)
- [x] `webhook_events` table + `ingestWebhook` skeleton (foundations §6.6) — migration 0012_webhook_events on prod (bookkeeping row 13, sha256 3e2f2c4d23efe0d2); helper at src/lib/webhooks/handle.ts with 4 unit tests covering signature failure / dup / success / handler-throw paths
- [ ] pg-boss install + worker process (foundations §17.7)
- [x] Sentry EU project + DSN wired up (foundations §15a.8, §12.3) — `@sentry/nextjs` installed; sentry.server/edge/instrumentation-client configs wired with PII scrubbing per §12.1 (src/lib/sentry/scrub.ts, 4 unit tests). Env-gated: when SENTRY_DSN unset, init is a no-op. User still needs to (1) create EU-region Sentry project + provide DSN, (2) optionally provide SENTRY_AUTH_TOKEN for source-map upload.
- [x] OpenTelemetry baseline tracing (foundations §12.3) — `@vercel/otel` + `@opentelemetry/{api,sdk-logs,api-logs,instrumentation}` installed; `instrumentation.ts` registers OTel with service name (defaults to `tavli-web`). Exporter target attaches in the Sentry unit (§12.3)
- [ ] Stripe SDK install + env config (foundations §17.8)
- [ ] Twilio SDK install + env config (foundations §17.7)

## Wave 2 — Identity + bookings reconciliation

*Unblocks: §09, §12, §14, §15 (all need `organizations`). Retires §02's audit-debt.*

- [ ] §01 `organizations` table + `restaurant_staff` table
- [ ] §01 `customer_type` enum + `tax_id` uniqueness enforcement
- [ ] §01 MFA / passkeys (§01 §5.2)
- [ ] §01 Tavli-admin support impersonation (§01 §5.3)
- [ ] §01 NIST 800-63B password policy + session revocation (§01 §5.1, §5a.4)
- [ ] §02 audit-write retrofit on every reservation mutation
- [ ] §02 `bulkExportReservations` action (§02 §4.8)
- [ ] §02 slot concurrency safety (§02 §4.7)
- [ ] §02 phone E.164 normalisation (§02 §4.7)
- [ ] §10 `companies` → `corporate_clients` consistency pass (small cleanup; §10)

## Wave 3 — Diner CRM + comms upgrade

*Unblocks: §07 analytics, §11 marketing (both consume diners + comms). Lands the cascade leaves §13 needs.*

- [ ] §03 `diners` + `diner_phone_links` + `diner_email_links`
- [ ] §03 `findOrCreateDinerForReservation` helper
- [ ] §03 `splitDiner` / `mergeDiner` actions
- [ ] §03 anonymisation handler + `diner_pii_access_log` (§03 §8.2)
- [ ] §04 `transactional_email_log` + `sms_log` with channel-specific status enums
- [ ] §04 Resend webhook routed through `ingestWebhook`
- [ ] §04 Twilio send + status webhook
- [ ] §04 `partner_notifications.pending_erasure` columns (for §13 two-phase cascade)

## Wave 4 — Compliance baseline + horizontal infra

*Unblocks: §11 (rate limits), §15 (cookie banner). Closes the §13 baseline.*

- [ ] §13 `data_subject_requests` + `retention_policies` + nightly purge job
- [ ] §13 `rate_limits` + `enforceRateLimit` middleware
- [ ] §13 `cookie_consents` + banner UI + analytics gating
- [ ] §13 legal pages (privacy, terms, cookies, ANPC, data-processing, imprint)
- [ ] §13 erasure cascade orchestrator (calls §03 + §04 handlers)
- [ ] §08 `tables` + `table_combinations` + `walkin_queue` + state machine
- [ ] §08 floor plan editor + `table_status_log`
- [ ] §05 `restaurant_translations` (RO + EN + DE per-locale)
- [ ] §05 EXIF stripping + per-tier photo/menu limits
- [ ] §06 reviews polish: `redacted_at`, `include_in_aggregate_rating`, `aggregate_consent_at`
- [ ] §06 DSA notice-and-action hooks (§15a.5)

## Wave 5 — Multi-location + billing

*Unblocks: §07, §11, §14, §15 (all need the billing-tier signal from `loadActiveSubscription`).*

- [ ] §09 `organizations.brand_primary` / `brand_secondary` columns
- [ ] §09 `restaurants.archived_at` rollup + venue archival flow
- [ ] §12 Stripe products + prices seed script with `tax_behavior: 'exclusive'` assertion
- [ ] §12 `subscriptions` + `subscription_items` + `invoices` + `payment_methods` + `billing_audit_log`
- [ ] §12 `startSubscription` (§12 §7.1) + day-91 PSD2/SCA conversion (§12 §7.3)
- [ ] §12 Stripe webhook router with two-layer idempotency (§12 §6.3.1)
- [ ] §12 cancellation + pro-rata annual refund (§12 §10)
- [ ] §12 tier swap (Base ↔ Pro) + frequency switch deferred to period-end (§12 §8.2, §8.3)
- [ ] §12 per-additional-location quantity sync hook from §09 (§12 §8.1)
- [ ] §12 tiered dunning — day 0–6 full / day 7 soft-lock / day 21 read-only (§12 §11.5)
- [ ] §12 `loadActiveSubscription` helper with React `cache()` memoization (§12 §3.5)

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

---

*Last updated: 2026-05-20. Initial draft after the architecture-doc perfection pass; first Wave 1 unit landed same day.*
