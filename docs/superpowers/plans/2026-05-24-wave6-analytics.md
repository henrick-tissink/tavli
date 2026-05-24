# Wave 6 — §07 Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, batched with
> checkpoints) — chosen because execution is in the same session with full spec context, matching the
> Wave 5 inline-TDD precedent. Steps use `- [ ]` checkboxes.
>
> **Detailed design lives in** `docs/superpowers/specs/2026-05-24-wave6-analytics-design.md` (§refs
> below point there). This plan is the **task sequence + file map + TDD cadence**; it does not
> re-duplicate the spec's SQL/column detail (DRY).

**Goal:** Ship §07 analytics — pre-computed aggregate substrate, async CSV/ZIP export with PII audit,
weekly-summary digest, and Base+Pro Recharts dashboards — all without live keys, DI-mocked.

**Architecture:** Nightly pg-boss jobs pre-compute daily/hourly/cohort/forecast aggregates keyed on
venue-local `business_date`; dashboards read aggregates + today's real-time delta; exports run as
streaming-ZIP jobs to a private bucket with signed URLs; tier gating via `loadActiveSubscription`.

**Tech Stack:** Next.js (custom build — read `node_modules/next/dist/docs/` before UI), Drizzle +
Supabase Postgres/Storage, pg-boss, React-Email + Resend, Recharts (new), archiver (new), Tailwind v4.

**Cadence per task:** write failing test → run (fail) → minimal impl → run (pass) → `npx tsc --noEmit; echo $?`
→ `git commit` tagged `(§07 Wave 6 sub-unit X.N)`. Use `npx jest <path>` for targeted runs (full suite
has the 11 pre-existing DB-integration failures = baseline; don't chase them).

---

## W6-A — Substrate (spec §2)

### Task A.1: Migration 0042 — analytics substrate
**Files:** Modify `src/lib/db/schema.ts` (5 tables + `restaurants.timezone`); Create
`drizzle/migrations/0042_analytics_substrate.sql`; Modify `drizzle/migrations/meta/_journal.json`.
- [ ] Add `timezone varchar(64) NOT NULL DEFAULT 'Europe/Bucharest'` to `restaurants` (schema.ts + SQL).
- [ ] Add the 5 tables (spec §2.1: daily/hourly/cohort/forecast/export-jobs) to schema.ts with exact
      columns + PKs + indexes from the architecture doc §4.1–4.4.
- [ ] Write `0042_analytics_substrate.sql`: ALTER restaurants; CREATE the 5 tables + indexes; CREATE
      `analytics_service_label_for_hour(t time) returns varchar(40)` (§5.1a windows + earlier-tie + all_day);
      `insert into storage.buckets ('exports','exports',false,1073741824)`; RLS policies (spec §2.1 #9).
- [ ] Append `_journal.json` entry (idx+1, same version, `Date.now()`, tag `0042_analytics_substrate`,
      `breakpoints:true`).
- [ ] Apply locally: `psql "$DATABASE_URL" -f drizzle/migrations/0042_analytics_substrate.sql` (source
      `.env.local`). Verify tables exist; check the `exports` bucket row + service-label fn return values.
- [ ] `npx tsc --noEmit; echo $?` → 0. Commit `(§07 Wave 6 sub-unit A.1)`.

### Task A.2: JOBS registry additions
**Files:** Modify `src/lib/jobs/keys.ts`; Test `src/lib/jobs/__tests__/keys.test.ts` (existing invariant).
- [ ] Add to `analytics`: `refreshAggregates`, `backfillAggregates`, `runExport`, `expireStaleExports`,
      `purgeStaleHourlyWindows` (spec §2.2 values — single-word domain, kebab, no underscores).
- [ ] Run `npx jest src/lib/jobs/__tests__/keys.test.ts` → PASS. `tsc`. Commit `(A.2)`.

### Task A.3: Pure aggregate cores
**Files:** Create `src/lib/analytics/service-label.ts`, `src/lib/analytics/source-fold.ts`,
`src/lib/analytics/cancel-reason.ts`; Tests alongside in `__tests__/`.
- [ ] Test+impl `serviceLabelForHour(time: string): 'brunch'|'lunch'|'dinner'|'late'|'all_day'`
      (TS mirror of the SQL fn; cover the 12:30→brunch, 22:00→dinner tie-breaks, 15:30→all_day gap).
- [ ] Test+impl `foldAcquisitionSource(src|null): SourceColumn` (9→7 fold per spec §2.3: import/api→manual,
      email_campaign→unknown, null→unknown).
- [ ] Test+impl `mapCancelReason(status, cancelledReason|null): CancelBucket` (structured text→bucket;
      cancelled+null→diner).
- [ ] `tsc`. Commit `(A.3)`.

### Task A.4: Forecast core
**Files:** Create `src/lib/analytics/forecast.ts` + `__tests__/forecast.test.ts`.
- [ ] Test+impl `trimmedMeanForecast(obs: number[]): {predicted,low,high} | null` — null when <12 obs;
      drop top+bottom; mean of remaining; band = ±1.5×IQR (spec §2.3 / doc §6.1).
- [ ] `tsc`. Commit `(A.4)`.

### Task A.5: Cohort retention core
**Files:** Create `src/lib/analytics/cohort.ts` + test.
- [ ] Test+impl `computeCohortRows(diners, visitsByDiner, runMonth)` → rows `{cohort_month, month_offset,
      cohort_size, retained_count, retention_rate}` with current-month recompute + past-month immutability
      contract (doc §5.1b) expressed as a pure transform the job feeds DB rows into.
- [ ] `tsc`. Commit `(A.5)`.

### Task A.6: refresh-aggregates job
**Files:** Create `src/lib/analytics/refresh-aggregates.ts` + test (injected fake `db`).
- [ ] Test+impl `makeRefreshAggregates({db})` → per-restaurant handler: daily upsert (uses A.3 cores via
      the SQL fn), lead-time percentiles (tz-constructed timestamptz, spec §2.3 step 3), hourly window,
      forecast upsert (A.4). Idempotent ON CONFLICT. Test asserts the upsert payload shape + idempotency +
      that archived restaurants are skipped, against a fake db recording calls.
- [ ] `tsc`. Commit `(A.6)`.

### Task A.7: refresh-cohorts job
**Files:** Create `src/lib/analytics/refresh-cohorts.ts` + test.
- [ ] Test+impl `makeRefreshCohorts({db})` → per-org handler using A.5; ON CONFLICT skips past months
      (`WHERE excluded.cohort_month >= date_trunc('month', now())`). Test the immutability guard.
- [ ] `tsc`. Commit `(A.7)`.

### Task A.8: backfill-aggregates job
**Files:** Create `src/lib/analytics/backfill-aggregates.ts` + test.
- [ ] Test+impl `makeBackfillAggregates({db})` — loops (restaurant, day) from earliest reservation to
      yesterday, reuses A.6 computation, restartable from last completed `(restaurant_id, business_date)`,
      heartbeat row-count. Test restart-resume + completion.
- [ ] `tsc`. Commit `(A.8)`.

### Task A.9: worker wiring + purge-stale-hourly-windows
**Files:** Modify `scripts/worker.ts`; Create `src/lib/analytics/purge-hourly.ts` + test.
- [ ] Test+impl `makePurgeStaleHourlyWindows({db})` (delete window_end_date < now-90d).
- [ ] Wire `boss.work`+`boss.schedule` for refreshAggregates (`0 1 * * *`), refreshCohorts (`0 1 * * *`,
      after), backfillAggregates (no schedule), purgeStaleHourlyWindows (`0 5 * * 1` weekly).
- [ ] `tsc`. Commit `(A.9)`. **Checkpoint: W6-A complete.**

---

## W6-B — Async export (spec §3)

### Task B.1: error codes
**Files:** Modify `src/lib/errors/codes.ts`.
- [ ] Add `TV503 backfill_in_progress` (and any further TV5xx the export job needs). `tsc`. Commit `(B.1)`.

### Task B.2: ExportReadyEmail template
**Files:** Create `src/emails/ExportReadyEmail.tsx` + `src/emails/__tests__/export-ready-email.test.ts`.
- [ ] Test (mock `@react-email/render`) + impl: per-locale `COPY` RO/EN/DE, `getSubject(locale)`, props
      `{downloadUrl, expiresAt, tables, locale}`. `tsc`. Commit `(B.2)`.

### Task B.3: run-export job
**Files:** Create `src/lib/analytics/run-export.ts` + test (injected `db`, `storage`, `sendEmail`,
`recordAudit`); add `archiver` dep.
- [ ] `npm i archiver @types/archiver`.
- [ ] Test+impl `makeRunExport({db, storage, sendEmail, recordAudit})` per spec §3.2: status running→ready,
      stream ZIP via archiver (one csvStringify CSV per requested table), private-bucket upload, 24h
      createSignedUrl, PII audit (`AUDIT.diner.pii_accessed` job-keyed) + `AUDIT.analytics.export_run`,
      ExportReadyEmail send, failure→`status='failed'`+TV5xx. Test asserts audit calls + status transitions +
      Base 12-month filter applied unless bypass.
- [ ] `tsc`. Commit `(B.3)`.

### Task B.4: create-export action
**Files:** Create `src/app/partner/(dashboard)/analytics/export-actions.ts` + test.
- [ ] Test+impl `requestAnalyticsExport(input)` `"use server"`: `requireCan('analytics.export')` (+
      `campaigns.read` if campaigns requested), insert `restaurant_export_jobs`, `enqueue(runExport,{jobId})`,
      return `ActionResult<{jobId}>`. Reject user-supplied `bypass_tier_limit_reason`. Test permission denial.
- [ ] `tsc`. Commit `(B.4)`.

### Task B.5: bypass override + cancel-subscription seam
**Files:** Modify `src/lib/billing/cancel-subscription.ts` (data-export TODO seam); test.
- [ ] Wire the cancel seam to enqueue runExport with `bypass_tier_limit_reason:'subscription_cancellation'`.
      Test the seam fires on cancel. `tsc`. Commit `(B.5)`.

### Task B.6: expire-stale-exports + wiring
**Files:** Create `src/lib/analytics/expire-stale-exports.ts` + test; Modify `scripts/worker.ts`.
- [ ] Test+impl `makeExpireStaleExports({db, storage})` (ready+past-expiry → delete object, status expired).
- [ ] Wire `boss.work`+`boss.schedule(runExport on-demand; expireStaleExports "0 4 * * *")`.
- [ ] `tsc`. Commit `(B.6)`. **Checkpoint: W6-B complete.**

---

## W6-C — Weekly digest (spec §4)

### Task C.1: WeeklySummaryEmail template
**Files:** Create `src/emails/WeeklySummaryEmail.tsx` + test.
- [ ] Test (render-mock) + impl: RO/EN/DE COPY, `getSubject(locale,{restaurantName})`, delta arrows, Pro
      section conditional on `tier`. `tsc`. Commit `(C.1)`.

### Task C.2: weekly-summary cores
**Files:** Create `src/lib/analytics/weekly-summary-core.ts` + test.
- [ ] Test+impl pure `computeWeekOverWeekDeltas(...)`, `resolveWeeklyAudience(members)` (owner/admin/manager),
      `weekBounds(now, tz)`. `tsc`. Commit `(C.2)`.

### Task C.3: weekly-summary job + wiring
**Files:** Create `src/lib/analytics/weekly-summary.ts` + test; Modify `scripts/worker.ts`.
- [ ] Test+impl `makeWeeklySummary({db, sendEmail})` per spec §4.1 (assemble from aggregates+reviews+forecast,
      send to audience, `AUDIT.analytics.weekly_summary_sent`). Wire `boss.schedule(weeklySummary,"0 18 * * 0")`.
- [ ] `tsc`. Commit `(C.3)`. **Checkpoint: W6-C complete.**

---

## W6-D — Dashboards (spec §5)

### Task D.1: recharts dep + analytics query layer
**Files:** add `recharts`; Create `src/lib/analytics/queries.ts` + test.
- [ ] `npm i recharts`.
- [ ] Test+impl `makeAnalyticsQueries({db})`: overview WoW, covers-per-service(30d), no-show trend(90d),
      party-mix(90d), cancel-reason(90d), Pro: heatmap/cohort/lead-time/channel/forecast. Each unions
      aggregates + today real-time. Org-rollup variants (sum across venues). Base 12-month filter helper.
- [ ] `tsc`. Commit `(D.1)`.

### Task D.2: Base dashboard page + charts
**Files:** Create `src/app/partner/(dashboard)/analytics/page.tsx` + `_components/*` (chart client components).
- [ ] Read `node_modules/next/dist/docs/` for current RSC/client conventions before writing.
- [ ] RSC resolves venue via `currentUserPrimaryRestaurant`; render Overview StatCards + 4 Recharts charts +
      empty/sparse states (§7.1.1). Hardcoded Romanian, house-style tokens. Export-modal trigger button.
- [ ] `tsc`. Commit `(D.2)`.

### Task D.3: Pro charts + tier gating
**Files:** add to the page + `_components/`.
- [ ] `loadActiveSubscription(orgId)` server-side gate; Pro charts (heatmap/cohort/lead-time/channel/forecast)
      or "Upgrade to Pro" CTA. Backend queries also gated. `tsc`. Commit `(D.3)`.

### Task D.4: Export modal
**Files:** Create `_components/ExportModal.tsx` (client) wiring `requestAnalyticsExport`.
- [ ] Date range / venues / includes; submit → "preparing, we'll email a link". `tsc`. Commit `(D.4)`.

### Task D.5: Org rollup page
**Files:** Create `src/app/partner/org/[orgId]/analytics/page.tsx`.
- [ ] Mirror the existing `org/[orgId]/venues` membership check; same charts org-aggregated with "split by
      venue" toggle. `tsc`. Commit `(D.5)`.

### Task D.6: frontend-design editorial pass
- [ ] Invoke `frontend-design` skill; refine the analytics surfaces to the editorial bar
      (`feedback_aesthetic_bar`). `tsc`. Commit `(D.6)`. **Checkpoint: W6-D complete → Wave 6 closed.**

---

## Self-review notes
- **Spec coverage:** A→§2, B→§3, C→§4, D→§5; all 5 build-order lines covered (tables=A.1; runExport=B.3;
  Pro dashboards=D.3; PII audit=B.3; weeklySummary=C.3). Cross-cutting locks (spec §6) land in A.1 (tz,
  bucket, fold/cancel maps), B.3 (archiver, signed url, bypass), D.1/D.3 (recharts, FOR-SHARE-deferred).
- **Out of scope (spec §8):** admin cohort-override UI, org-aggregate table, FOR SHARE lock, top-dishes,
  YoY, date-range picker — not tasked.
