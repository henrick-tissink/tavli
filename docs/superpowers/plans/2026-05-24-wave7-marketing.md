# Wave 7 — §11 Marketing Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, batched) — same
> session with full spec context, matching the Wave 5/6 inline-TDD precedent. Steps use `- [ ]`.
>
> **Detailed design:** `docs/superpowers/specs/2026-05-24-wave7-marketing-design.md` (§refs below point
> there). Architecture detail: `docs/superpowers/architecture/11-marketing-suite.md`. This plan is the
> task sequence + file map + TDD cadence; it does not re-duplicate the spec's column lists (DRY).

**Goal:** Ship the §11 marketing substrate — data model, consent/suppression, the 3-channel send +
policy layer, segment-compile + fan-out job mesh, RFC 8058 unsubscribe + click tracking, and the
monthly overage feed — all without live keys, DI-mocked.

**Architecture:** Campaigns are definitions; fan-out materializes a segment into per-recipient
`marketing_sends` rows + leaf send-message jobs that run a policy stack (Pro-tier/suppression/consent/
freq-cap/quota/quiet-hours) before calling DI-injected Resend/Twilio clients. Consent lives in the
existing `marketing_consents` (extended) + a new append-only audit; suppression supersedes consent.

**Tech Stack:** Next.js (custom — read `node_modules/next/dist/docs/` before UI routes), Drizzle +
Supabase Postgres, pg-boss, existing Resend/Twilio wrappers (injected), HMAC tokens.

**Cadence per task:** failing test → run (fail) → impl → run (pass) → `npx tsc --noEmit; echo $?` →
`git commit` tagged `(§11 Wave 7 sub-unit X.N)`. Targeted `npx jest <path>` (11 DB suites fail = baseline).

---

## W7-A — Substrate (spec §2)

### Task A.1: Migration 0043 — enums + new tables + ALTERs + RLS
**Files:** Modify `src/lib/db/schema.ts`; Create `drizzle/migrations/0043_marketing_substrate.sql`;
Modify `drizzle/migrations/meta/_journal.json`.
- [ ] Add 6 enums (spec §2.1) + 8 new tables (spec §2.2: settings/campaigns/versions/segments/sends/
      quota_usage/link_clicks/consent_audit) to schema.ts with the §11-doc columns/indexes.
- [ ] Add ALTERs (spec §2.3) to schema.ts: marketing_consents (+4 nullable cols), marketing_suppressions
      (+unsuppressedAt, +sourceSendId), reservations (+campaignId), organizations (+marketingFrequencyCapPerMonth).
- [ ] Write `0043_marketing_substrate.sql`: CREATE TYPE ×6; CREATE TABLE ×8 + indexes; ALTER the 4
      existing tables (incl. drop+recreate the two channel CHECK constraints adding whatsapp values);
      add `marketing_campaigns.segment_id` FK + `reservations.campaign_id` FK + `marketing_suppressions.
      source_send_id` FK; RLS policies (spec §2.2). Apply via `psql "$DATABASE_URL" -f` (RLS joining
      restaurants.organization_id won't apply locally — fine).
- [ ] Append `_journal.json` (idx 43, version 7, Date.now(), tag `0043_marketing_substrate`, breakpoints).
- [ ] Smoke-test the diner-independent DDL + a sample insert via psql. `npx tsc --noEmit; echo $?` → 0.
      Commit `(§11 Wave 7 sub-unit A.1)`.

### Task A.2: JOBS registry additions
**Files:** Modify `src/lib/jobs/keys.ts`; Test `src/lib/jobs/__tests__/keys.test.ts`.
- [ ] Add 8 keys to `marketing` (spec §2.4). Run `npx jest src/lib/jobs/__tests__/keys.test.ts` → PASS.
      `tsc`. Commit `(A.2)`.

---

## W7-B — Consent + suppression (spec §3)

### Task B.1: channel bridge + suppression core
**Files:** Create `src/lib/marketing/channel.ts`, `src/lib/marketing/suppression.ts` + `__tests__/`.
- [ ] Test+impl `marketingConsentChannel(ch)` (email→email_marketing, sms→sms_marketing,
      whatsapp→whatsapp_marketing, in_confirmation→email_marketing).
- [ ] Test+impl `makeSuppression({db})` → `addSuppression`/`isSuppressed`/`liftSuppression`
      (active = unsuppressed_at IS NULL; lower(identifier)); `addSuppression` writes
      `AUDIT.marketing.suppression_added`. Inject fake db + recordAudit. `tsc`. Commit `(B.1)`.

### Task B.2: recordConsent + consent audit
**Files:** Create `src/lib/marketing/consent.ts` + test.
- [ ] Test+impl `makeConsent({db, recordAudit})` → `recordConsent(input)` (writes marketing_consents
      channel `{x}_marketing` consent_given=optIn; on opt-out sets revoked_at + cascades addSuppression;
      always appends marketing_consent_audit + AUDIT.marketing.consent_captured|consent_revoked;
      idempotent on same state) + `hasConsent(db, dinerId, orgId, channel)` (latest non-revoked
      consent_given=true). Assert idempotency + opt-out cascade. `tsc`. Commit `(B.2)`.

---

## W7-C — Senders + policy (spec §4)

### Task C.1: policy stack
**Files:** Create `src/lib/marketing/send/policy.ts` + test.
- [ ] Test+impl `makeMarketingPolicy({db, loadTier, now})` → `evaluate({dinerId, orgId, restaurantId,
      channel, locale, diner})` returning `{allow:true} | {skip: <marketing_send_status>}` in order:
      tier (non-pro→skip), suppression, consent, frequency-cap (count this-month marketing_sends vs
      organizations.marketing_frequency_cap_per_month), quota (vs allowance×buffer), quiet-hours
      (sms/whatsapp only). Test each gate's skip status with injected fakes. `tsc`. Commit `(C.1)`.

### Task C.2: STOP suffix + email/sms/whatsapp senders
**Files:** Create `src/lib/marketing/send/stop-suffix.ts`, `src/lib/marketing/send/senders.ts` + tests.
- [ ] Test+impl `appendStopSuffix(body, locale, shortcode?)` (RO/EN/DE per foundations §7.1; no-op if
      already present).
- [ ] Test+impl `makeSendMarketingEmail/Sms/Whatsapp({client, db, policy, now})`: run policy → skip-row
      or send; insert marketing_sends, call injected client, update status+providerId, bump
      quota_usage.sent_count. WhatsApp: TV904 gate (settings not enabled → fail). SMS: appendStopSuffix.
      Assert skip path writes the skip status + no client call; happy path calls client + increments
      quota. `tsc`. Commit `(C.2)`.

---

## W7-D — Segment compile + fan-out mesh (spec §5)

### Task D.1: segment filter compiler
**Files:** Create `src/lib/marketing/segment-compile.ts` + test.
- [ ] Test+impl `compileSegmentFilter(dsl, combinator, scope)` → Drizzle `SQL` WHERE over diners for the
      6 dimensions + AND/OR + top-level `not`. Test a multi-condition AND, an OR, and a `not`. `tsc`.
      Commit `(D.1)`.

### Task D.2: fan-out + send-message + fire-triggered
**Files:** Create `src/lib/marketing/fan-out.ts`, `src/lib/marketing/send-message-handler.ts`,
`src/lib/marketing/fire-triggered.ts` + tests.
- [ ] Test+impl `makeFanOutCampaign({db, enqueue, now})`: chunk of 500 — multi-row insert sends +
      batch-enqueue send-message; re-enqueue self with offset until exhausted; first chunk writes
      AUDIT.marketing.campaign_sent; enforce 50k cap. Assert chunking + re-enqueue + cap.
- [ ] Test+impl `makeSendMessageHandler({db, senders})` (load send+campaign+diner → dispatch to channel
      sender). `makeFireTriggeredCampaign({db, enqueue})` (match active triggered campaigns for an event
      → create send + enqueue). `tsc`. Commit `(D.2)`.

---

## W7-E — Unsubscribe + click tracking (spec §6)

### Task E.1: HMAC tokens
**Files:** Create `src/lib/marketing/tokens.ts` + test.
- [ ] Test+impl `signSendToken(sendId, {campaignId, dinerId})` + `verifySendToken(sendId, token, …)`
      (HMAC w/ LINK_TRACKING_SECRET, dev fallback constant; tamper → false). `tsc`. Commit `(E.1)`.

### Task E.2: /u unsubscribe + /c click routes
**Files:** Create `src/app/(public)/u/[sendId]/[token]/route.ts` (or page+action),
`src/app/(public)/c/[sendId]/[token]/route.ts`. Read `node_modules/next/dist/docs/` for route handlers.
- [ ] `/u` GET → confirm page (no revoke); POST → verify token, revoke consent + addSuppression
      (reason 'unsubscribed') + audit, render post-unsub page. List-Unsubscribe-Post compatible.
- [ ] `/c` GET → verify token, insert marketing_link_clicks (60s ip+token dedup), bump
      first_clicked_at/click_count, 302 to decoded `?dst`. `tsc` + lint. Commit `(E.2)`.

---

## W7-F — Overage feed + quota jobs (spec §7)

### Task F.1: monthly overage + usage-alert + attribution
**Files:** Create `src/lib/marketing/jobs/monthly-overage.ts`, `usage-alert.ts`, `attribution.ts` + tests.
- [ ] Test+impl `makeMonthlyOverageBilling({db, enqueue})` (prior-month per-(org,channel) overage cents:
      SMS €0.06/WhatsApp €0.03/email free → write overage_billed_cents + enqueue
      JOBS.billing.reportMarketingOverage). Assert cents math + handoff payload.
- [ ] Test+impl `makeUsageAlert({db, sendEmail})` (80%/100% threshold crossing → alert + bump
      last_alert_threshold) + `makeComputeAttribution({db})` (recent reservation from diner w/ click ≤14d
      → set reservations.campaign_id + marketing_sends.attributed_reservation_id). `tsc`. Commit `(F.1)`.

### Task F.2: worker wiring
**Files:** Modify `scripts/worker.ts`.
- [ ] Wire `boss.work` for fanOut, sendMessage, fireTriggeredCampaign, computeAttribution (every 5m),
      usageAlert (hourly), monthlyOverageBilling (`0 2 1 * *`), refreshSegmentSize (every 6h),
      purgeOldLinkClicks (nightly). `tsc`. Commit `(F.2)`. **Checkpoint: Wave 7 substrate complete.**

---

## Self-review notes
- **Spec coverage:** A→§2 (incl. all tables/ALTERs/FK/audit-registry), B→§3, C→§4, D→§5, E→§6, F→§7.
  All 7 build-order lines: tables=A.1; fan-out mesh=D.2; unsubscribe+STOP=E.2+C.2; WhatsApp gate=C.2;
  overage feed=F.1; reservations.campaign_id FK=A.1; audit-key map=A (registry) + B/D (wiring).
- **Locked decisions (spec §8):** single consent table (extend marketing_consents) — A.1+B.2; extend
  suppressions — A.1+B.1; all-3-channels mocked — C.2; Pro-only gate — C.1; freq-cap col — A.1+C.1.
- **Out of scope (spec §10):** all UI, list-building surfaces, analytics dashboards, triggered-campaign
  copy seed, in-confirmation render, Meta template submission — not tasked.
