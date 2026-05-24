# Wave 7 — §11 Marketing Suite (design / spec)

> Date: 2026-05-24. Authoritative architecture: `docs/superpowers/architecture/11-marketing-suite.md`.
> This spec records the **build-ready substrate scope** for Wave 7 — the 7 build-order lines —
> reconciled against the *actual* schema/infra (verified 2026-05-24). Where this spec and the §11
> doc differ, **this spec wins** (the doc predates the shipped Wave 3/4 marketing foundation).
>
> Standing USER directive: build ALL remaining waves WITHOUT live keys; defer live testing. External
> clients injected via `make*({deps})` DI + mocked; the existing Resend/Twilio wrappers already have
> keyless dev fallbacks. Lib `make*` throws `TV9##`; app `"use server"` wraps via `toResult`.

## 0. Scope boundary

Wave 7 = **data model + send mechanics + policy + fan-out + unsubscribe + overage** (the 7 build-order
lines). **DEFERRED** (non-build-order surfaces, per the established defer-UI pattern): campaign builder
UI, segment builder UI, the 7 list-building capture surfaces, analytics dashboards, settings UI, diner
consent panel, and seeding the 6 triggered campaigns' trilingual copy. We build the *firing mechanism*,
not the content/UI.

| Sub-unit | Build-order line(s) | One-line purpose |
|---|---|---|
| **A** Substrate | tables + FK + audit map | Migration 0043: enums + new tables + extend `marketing_consents`/`marketing_suppressions` + `reservations.campaign_id`+FK + `organizations.marketing_frequency_cap_per_month` + RLS + JOBS keys. |
| **B** Consent/suppression | (consent + suppression cores) | `recordConsent` (→ marketing_consents + marketing_consent_audit + AUDIT) + suppression helpers (supersedes consent). |
| **C** Senders + policy | RFC 8058 STOP suffix, WhatsApp TV904 gate | `sendMarketing{Email,Sms,Whatsapp}` (DI-mocked) + policy stack (Pro-tier, suppression, consent, freq-cap, quiet-hours, quota) + STOP suffix + WhatsApp gate. |
| **D** Fan-out mesh | fan-out: scheduled + triggered + per-recipient | `compileSegmentFilter` + `fan-out-campaign` (chunked) + `send-message` leaf + `fire-triggered-campaign`. |
| **E** Unsubscribe/tracking | RFC 8058 unsubscribe | `/u/[sendId]/[token]` (GET confirm + POST revoke) + `/c/[sendId]/[token]` click tracking + HMAC. |
| **F** Overage/quota | overage → reportMarketingOverage | `monthly-overage-billing` → billing handoff + `usage-alert` + `compute-attribution`. |

Order A→F. Execute inline with TDD, one commit per piece tagged `(§11 Wave 7 sub-unit X.N)`.

## 1. Verified-schema reconciliations (the corrections that make this buildable)

Confirmed against `src/lib/db/schema.ts` + infra on 2026-05-24:

1. **`marketing_consents` EXISTS and is actively used** — transactional SMS wrapper
   (`src/lib/sms/send-transactional.ts`) reads it (`channel='sms_transactional'`), and the GDPR
   erasure cascade (`src/lib/compliance/handlers/marketing-consents.ts` + pii-table-registry) redacts
   it. Columns: `id, diner_id, organization_id, channel varchar(30), consent_given boolean, source
   varchar(40), given_at, revoked_at, context jsonb`. Channel check =
   `('email_marketing','sms_marketing','sms_transactional','email_transactional')`. Index
   `(diner_id, channel, given_at desc)` (NOT unique).
   - **DECISION (best solution, deviates from doc):** do NOT create the doc's `customer_consents`.
     Extend `marketing_consents` into the single canonical consent table: add nullable
     `source_surface_url text`, `source_ip inet`, `consent_copy_shown text`, `consent_locale char(2)`;
     widen the channel check to add `'whatsapp_marketing'`. One consent table → no fragmentation,
     reuses the existing GDPR erasure cascade, transactional consumer untouched. The rich append-only
     legal trail lives in the new `marketing_consent_audit` (§4.11).
   - **Channel bridge:** marketing_channel `email|sms|whatsapp` → consent channel `{x}_marketing`;
     `in_confirmation` reuses `email_marketing` (it's an email promo). Helper
     `marketingConsentChannel(ch)`.
2. **`marketing_suppressions` EXISTS** — columns `id, channel varchar(20), identifier varchar(255),
   source varchar(40), reason text, organization_id (nullable, set-null), created_at`. Channel check
   `('email','sms')`. Unique index `(channel, lower(identifier))`. Referenced by erasure cascade.
   - **DECISION:** extend it — add `'whatsapp'` to the channel check, add nullable `unsuppressed_at
     timestamptz` + `source_send_id uuid` (FK to marketing_sends, added after that table). Keep the
     `identifier` column name (don't rename — avoid breaking writers). The active-suppression check
     uses `(organization_id, channel, lower(identifier)) where unsuppressed_at is null`.
3. **`reservations.campaign_id` does NOT exist** — add the column (`uuid`, nullable) + FK to
   `marketing_campaigns(id) on delete set null` in 0043 (doc assumed §02 added the column; it didn't).
4. **`organizations.marketing_frequency_cap_per_month` does NOT exist** — add `integer not null
   default 4` (§10.2).
5. **`AUDIT.marketing.*` — all 10 keys already registered** (`campaign_created/edited/paused/archived/
   sent`, `segment_created/edited`, `suppression_added`, `consent_captured/revoked`). The "cross-domain
   audit-key mapping" line = wiring the keys that the built mechanics fire (consent_captured/revoked,
   suppression_added, campaign_sent) — campaign_created/edited/paused/archived fire from the deferred UI.
6. **`JOBS.marketing` has 4 keys** (`scheduledCampaignSend`, `fanOut`=`triggered-campaign-fan-out`,
   `sendMessage`, `suppressionPurge`) + **`JOBS.billing.reportMarketingOverage`** exists. Wave 7 ADDS:
   `fireTriggeredCampaign`, `refreshSegmentSize`, `usageAlert`, `computeAttribution`,
   `monthlyOverageBilling`, `processResendWebhook`, `processTwilioWebhook`, `purgeOldLinkClicks`
   (single-word domain `marketing`, kebab, no underscores).
7. **Permissions** `campaign.{create,send,read,delete}` exist (no `marketing.*` family). Sufficient.
8. **Wrappers exist + DI-friendly + keyless dev fallback:** `sendTransactionalEmail`/`makeSend…`
   (`ResendLike` interface), `sendTransactionalSms`/`makeSend…` (`TwilioClient` interface). Marketing
   senders reuse these client interfaces, injected; no live keys.
9. **`webhook_events` + `ingestWebhook`** (foundations §6.6) exist for Resend/Twilio webhook idempotency.
10. **No `next-intl`** — any v1.5 UI is hardcoded RO; emails use per-locale jsonb templates (`{ro,en,de}`).
11. **`diners`** has every column segmentation/triggers need (birthday_date, anniversary_date,
    frequency_bucket, occasion_tags, acquisition_source, locale, last_visited_at, visit_count).

## 2. W7-A — Substrate (migration 0043)

### 2.1 Enums (6 new)
`marketing_channel ('email','sms','whatsapp','in_confirmation')`,
`marketing_campaign_kind ('triggered','one_off')`,
`marketing_campaign_status ('draft','active','paused','archived','scheduled','sending','sent','cancelled')`,
`marketing_send_status ('queued','sent','delivered','bounced','complained','failed','skipped_cap','skipped_suppressed','skipped_quiet_hours','skipped_quota','unsubscribed','opened','clicked')`,
`consent_source ('booking_flow','qr_tent','venue_page','walk_in_manual','csv_import','review_flow','admin')`,
`segment_combinator ('and','or')`.

### 2.2 New tables (§4) — Drizzle in schema.ts + raw SQL + RLS
`restaurant_marketing_settings` (§4.2), `marketing_campaigns` (§4.3), `marketing_campaign_versions`
(§4.4), `marketing_segments` (§4.5) + the deferred `marketing_campaigns.segment_id` FK, `marketing_sends`
(§4.6), `marketing_quota_usage` (§4.9), `marketing_link_clicks` (§4.10), `marketing_consent_audit`
(§4.11). All with the doc's columns/indexes. RLS per §4.12 (org members read; org admins write;
service-role mutates sends/quota). **No `customer_consents`** (see §1.1).

### 2.3 ALTERs
- `marketing_consents`: + `source_surface_url text`, `source_ip inet`, `consent_copy_shown text`,
  `consent_locale char(2)` (nullable); drop+recreate channel check adding `'whatsapp_marketing'`.
- `marketing_suppressions`: + `unsuppressed_at timestamptz`, `source_send_id uuid` (FK marketing_sends
  set-null); drop+recreate channel check adding `'whatsapp'`.
- `reservations`: + `campaign_id uuid` + FK → marketing_campaigns set-null.
- `organizations`: + `marketing_frequency_cap_per_month integer not null default 4`.

### 2.4 JOBS additions (`src/lib/jobs/keys.ts`)
Add to `marketing`: `fireTriggeredCampaign: "marketing.fire-triggered-campaign"`,
`refreshSegmentSize: "marketing.refresh-segment-size"`, `usageAlert: "marketing.usage-alert"`,
`computeAttribution: "marketing.compute-attribution"`, `monthlyOverageBilling:
"marketing.monthly-overage-billing"`, `processResendWebhook: "marketing.process-resend-webhook"`,
`processTwilioWebhook: "marketing.process-twilio-webhook"`, `purgeOldLinkClicks:
"marketing.purge-old-link-clicks"`. (keys.test invariant.)

Local apply via `psql "$DATABASE_URL" -f` (RLS policies joining restaurants.organization_id won't
apply on the drifted local DB — correct for prod, same as 0040–0042).

## 3. W7-B — Consent + suppression (`src/lib/marketing/`)

- `consent.ts` — `recordConsent({dinerId, organizationId, channel, source, sourceSurfaceUrl?, copyShown,
  locale, ip?, capturedByUserId?, optIn})`: writes `marketing_consents` (channel `{x}_marketing`,
  `consent_given=optIn`); on revoke sets `revoked_at` on the active row; always appends
  `marketing_consent_audit` + `recordAudit(AUDIT.marketing.consent_captured|consent_revoked)`. On
  opt-out, cascade-insert a `marketing_suppressions` row. Idempotent (no-op if same state).
  `hasConsent(db, dinerId, orgId, channel)` → latest non-revoked `consent_given=true`.
- `suppression.ts` — `addSuppression({organizationId, channel, identifier, reason, sourceSendId?})`
  (upsert active; `AUDIT.marketing.suppression_added`), `isSuppressed(db, orgId, channel, identifier)`
  (active row exists), `liftSuppression` (set unsuppressed_at on re-opt-in).
- Tested cores: the consent-state transitions + channel bridge + suppression-supersedes-consent rule.

## 4. W7-C — Channel senders + policy (`src/lib/marketing/send/`)

`makeMarketingPolicy({db, loadTier, now})` → `evaluate({dinerId, orgId, restaurantId, channel, locale})`
returns `{ allow: true } | { skip: marketing_send_status }` applying, in order: **Pro-tier gate**
(`loadTier(org)!=='pro'` → fail TV-tier or skip), **suppression**, **consent**, **frequency-cap**
(count marketing_sends this month vs `organizations.marketing_frequency_cap_per_month`), **quota**
(marketing_quota_usage vs allowance×buffer → `skipped_quota`), **quiet-hours** (SMS/WhatsApp only,
diner-local vs `restaurant_marketing_settings`). Pure-testable with injected db.

`senders.ts` — `makeSendMarketingEmail/Sms/Whatsapp({email|sms client, db, now})`:
1. run policy → if skip, write `marketing_sends` row with the skip status, return.
2. else insert `marketing_sends` (status `queued`), call the injected provider client, update status +
   provider id, increment `marketing_quota_usage.sent_count`.
- **SMS**: append the locale STOP suffix (RO/EN/DE per foundations §7.1) if missing; the existing SMS
  wrapper's client is injected.
- **WhatsApp**: **TV904 gate** — if `!settings.whatsapp_enabled || !waba_id || !phone_number_id` →
  return `fail('TV904')` (defence-in-depth). Template-message only.
- **Email**: `List-Unsubscribe` + `List-Unsubscribe-Post` headers with `/u/<sendId>/<token>`; wrap links
  via `/c` shortener.

## 5. W7-D — Segment compile + fan-out mesh (`src/lib/marketing/`)

- `segment-compile.ts` — `compileSegmentFilter(dsl, combinator, {orgId, restaurantId?})` → a Drizzle
  `SQL` WHERE over `diners` covering the 6 dimensions (recency=last_visited_at, frequency=frequency_bucket,
  party-size=typical_party_size_*, service-pref, occasion=occasion_tags, channel=acquisition_source),
  AND/OR + top-level `not`. `estimateSegmentSize(db, …)`. Pure-tested DSL→SQL.
- `fan-out.ts` — `makeFanOutCampaign({db, now})`: materialize segment (or snapshot ids), dedup, process
  in **chunks of 500** — multi-row INSERT `marketing_sends` (status queued) + batch-enqueue
  `marketing.send-message`; re-enqueue self with offset until done; on first chunk write
  `AUDIT.marketing.campaign_sent`. Enforce 50k cap + 1-campaign-per-org.
- `send-message-handler.ts` — `makeSendMessageHandler({db, senders})`: load the send row + campaign +
  diner, dispatch to the channel sender (which re-runs policy at leaf time — dynamic correctness).
- `fire-triggered.ts` — `makeFireTriggeredCampaign({db})`: given `{trigger_event, dinerId,
  reservationId?}`, find matching active `triggered` campaigns, create a send + enqueue. Enqueued by
  §02/§03 event hooks (forward-declared seam; wiring those emitters is out of Wave 7 unless trivial).

## 6. W7-E — Unsubscribe + click tracking (`src/app/(public)/`)

- `src/lib/marketing/tokens.ts` — `signSendToken(sendId)` / `verifySendToken(sendId, token)` = HMAC of
  `(campaignId+dinerId+sendId)` with `LINK_TRACKING_SECRET` (env; dev fallback constant).
- `/u/[sendId]/[token]` route — **GET** renders a confirm page (does NOT revoke — prefetch-safe);
  **POST** revokes the `marketing_consents` row + `addSuppression(reason:'unsubscribed')` + audit
  (RFC 8058, foundations §6.5). Returns the post-unsub page.
- `/c/[sendId]/[token]` route — verify token → insert `marketing_link_clicks` (60s per-(ip,token) dedup)
  → bump `first_clicked_at`/`click_count` → 302 to `?dst=` destination. Token expiry per §5.2.

## 7. W7-F — Overage feed + quota jobs (`src/lib/marketing/jobs/`)

- `monthly-overage.ts` — `makeMonthlyOverageBilling({db, reportOverage})`: for prior month, per
  (org, channel) compute `overage_count = max(0, sent_count - included_allowance)` and bill cents
  (SMS €0.06, WhatsApp €0.03, email free), write `overage_billed_cents`, and hand off to billing via
  `enqueue(JOBS.billing.reportMarketingOverage, {orgId, yearMonth, lines})`. (The billing-side consumer
  is §12's `reportMarketingOverage` job — already a registered key; its handler is a thin forward-decl
  if not present.)
- `usage-alert.ts` — hourly: cross 80%/100% of allowance → email org admins, bump `last_alert_threshold`.
- `attribution.ts` — `makeComputeAttribution({db})`: reservations created recently from diners with a
  marketing click in the last 14 days → set `reservations.campaign_id` + `marketing_sends.attributed_
  reservation_id`.
- Worker wiring for all Wave 7 jobs in `scripts/worker.ts`.

## 8. Cross-cutting decisions (locked)
1. **Single consent table** — extend `marketing_consents`; no `customer_consents` (best solution; §1.1).
2. **Extend `marketing_suppressions`** (whatsapp + unsuppressed_at + source_send_id; keep `identifier`).
3. **All 3 channels** built with DI-mocked providers (existing wrappers' client interfaces injected).
4. **Marketing is Pro-only** — tier gate in the policy layer (`loadActiveSubscription`).
5. **Frequency cap from `organizations.marketing_frequency_cap_per_month`** (default 4).
6. **reservations.campaign_id column + FK both added here** (column didn't exist).
7. **AUDIT.marketing keys already registered** — Wave 7 wires consent/suppression/campaign_sent; the
   campaign CRUD audits land with the deferred UI.
8. **Triggered-campaign event emitters** (§02/§03 firing the events) are a forward-declared seam — the
   `fire-triggered-campaign` consumer is built; wiring emitters is deferred with the event sources.

## 9. Conventions (carried from Waves 5–6)
DI-mocked clients; lib `make*({deps})` throws `TV9##`; app `"use server"` wraps via `toResult`; migration
recipe (schema.ts + raw SQL + journal, `psql -f` locally); JOBS single-word-domain/kebab/no-underscore;
email render-mock + `@jest-environment node` test gotcha; audit via `recordAudit` + `AUDIT.marketing.*`;
`"use server"` files export only async fns (no factories — the cookie-consent build bug); TDD per piece →
`npx tsc --noEmit; echo $?` → commit. Verify doc-vs-schema before writing SQL.

## 10. Out of scope (Wave 7 — deferred, non-build-order)
Campaign builder UI, segment builder UI, the 7 list-building capture surfaces (booking-flow/QR/venue-page/
walk-in/CSV/review/admin), analytics dashboards, settings UI, diner consent panel, seeding the 6 triggered
campaigns' trilingual copy, in-confirmation upsell render integration, MJML, A/B testing, self-serve
preferences page, referrals. WhatsApp template-submission-to-Meta workflow (only the send + TV904 gate
are in scope). Pre-arrival reminders are §04 transactional (never §11).
