# Wave 6 — §07 Analytics & Reports (design / spec)

> Date: 2026-05-24. Authoritative architecture: `docs/superpowers/architecture/07-analytics-and-reports.md`.
> This spec records the **build-ready** design: the §07 doc's intent reconciled against the
> *actual* schema/infra (verified 2026-05-24), with every discrepancy resolved. Where this spec
> and the §07 doc differ, **this spec wins** (the doc predates the shipped schema).
>
> Built per the standing USER directive: **all remaining waves without live Stripe/keys; defer
> live testing.** External clients injected via `make*({deps})` DI + mocked in tests. Lib-layer
> throws `TV5xx`; app-layer `"use server"` wraps via `toResult`. TDD per piece, one commit per
> logical unit tagged `(§07 Wave 6 sub-unit X.N)`, `npx tsc --noEmit` verified directly.

## 0. Decomposition

| Sub-unit | Build-order line(s) | One-line purpose |
|---|---|---|
| **W6-A** Substrate | §07 aggregate + cohort tables | Migration 0042 (5 tables + `restaurants.timezone` + service-label SQL fn + private `exports` bucket + RLS) and the `analytics.refresh-aggregates` + `analytics.refresh-cohorts` + `analytics.backfill-aggregates` jobs. |
| **W6-B** Export | §07 `runExport` ZIP + PII-access audit | `restaurant_export_jobs` create-action (permission gate) + `analytics.run-export` streaming-ZIP job + `ExportReadyEmail` + PII-access audit on every export + `bypass_tier_limit_reason` override (closes the W5-F cancel-export seam) + `analytics.expire-stale-exports`. |
| **W6-C** Digest | §07 `analytics.weeklySummary` | Weekly-summary data assembly + `WeeklySummaryEmail` (RO/EN/DE) + audience resolution. |
| **W6-D** Dashboards | §07 Pro dashboards | Recharts. Base + Pro dashboards + org rollup + export modal + empty/sparse states + tier gating. `frontend-design`-skill editorial pass (hardcoded Romanian, house style). |

Order: A → B → C → D (each depends only on substrate or is independent; D reads everything).

---

## 1. Verified-schema reconciliations (the corrections that make this buildable)

These are facts confirmed against `src/lib/db/schema.ts` + infra on 2026-05-24. The §07 doc's
SQL/columns are adjusted to these.

1. **`restaurants` has NO `timezone` column.** Migration 0042 **adds**
   `timezone varchar(64) NOT NULL DEFAULT 'Europe/Bucharest'` to `restaurants`. All v1 venues are
   Bucharest; the column is forward-compatible for future expansion and is the anchor for every
   venue-local date predicate + `business_date` computation in this wave.
2. **Reservation columns (exact):** `restaurantId`, `partySize` (smallint), `reservationDate`
   (date), `reservationTime` (time), `status` enum = `confirmed|cancelled|seated|completed|no_show`,
   `bookingType` enum = `standard|private_event|standing`, `cancelledReason` (**text, nullable** —
   not an enum), `cancelledAt`, `createdAt` (timestamptz), `dinerId` (nullable), `zone`, `notes`,
   `guestName`/`guestPhone`/`guestEmail`, `redactedAt`. There is **no** `reservation_at` timestamptz
   and **no** `campaign_id` / `source` column on reservations.
3. **`diners` is ORG-scoped** (`organizationId`), with `acquisitionSource` enum =
   `widget|venue_page|editorial|corporate|walk_in|manual|import|email_campaign|api` (+ null),
   `acquisitionRestaurantId`, `firstVisitedAt`, `lastVisitedAt`, `redactedAt`.
4. **i18n:** no `next-intl`. Partner UI is hardcoded Romanian; `profile.locale` exists but is unused
   in pages. Emails use per-locale `COPY` objects + `getSubject(locale)` (see `TrialEndingEmail.tsx`).
5. **Audit:** `recordAudit(input, executor?)`; `AUDIT.diner.pii_accessed` and
   `AUDIT.analytics.{export_run,cohort_manually_overridden,weekly_summary_sent}` all exist. Context
   is capped at 4 KB and **rejects PII keys** (`full_name`/`phone`/`email`) — our audits carry only
   IDs/counts, never PII.
6. **Permissions:** `analytics.read` (org_owner/org_admin/org_manager/venue_owner/venue_manager),
   `analytics.export` (org_owner/org_admin/venue_owner), `campaigns.read` (marketing) all exist.
   `requireCan(session, action, subject)` returns `null` on allow, `fail("forbidden")` on deny.
7. **Storage:** service-role client `createSupabaseAdminClient()` (`src/lib/db/admin.ts`);
   `admin.storage.from(bucket).upload(...)` / `.createSignedUrl(path, expiresIn)`. Photos bucket is
   public — **exports bucket must be private.**
8. **Email send:** `sendTransactionalEmail({to, locale, templateKey, subject, html, text, context})`
   (`src/lib/email/send-transactional.ts`) — logs first, then Resend, honours
   `EMAIL_DEV_FORCED_RECIPIENT`. Render via `@react-email/render` `render(Component(props))` +
   `{plainText:true}`. **Test gotcha:** mock `@react-email/render` (jsdom can't do its dynamic import).
9. **CSV:** `csvStringify(rows, columns)` (RFC-4180, `\r\n`) at `src/lib/csv/stringify.ts` — reused.
   Existing synchronous `bulkExportReservations` action stays; the async ZIP job is the large/multi-
   table/org path.
10. **Jobs:** `boss.work(JOBS.x, async ([job]) => handler(job.data))` + `boss.schedule(JOBS.x, cron)`
    in `scripts/worker.ts`; `enqueue(key, data, opts)` for on-demand. No per-restaurant-TZ stagger
    precedent → v1 uses one global nightly cron whose handler loops restaurants and derives each
    `business_date` from `restaurants.timezone`.
11. **`loadActiveSubscription(orgId)`** → `ActiveSubscriptionState | null` (`{tier:'base'|'pro',
    status, ...}`), `cache()`-memoized, never throws, returns `null` for every org until billing is
    live. Used as-is for tier gating; **no `FOR SHARE` lock in v1** (see §6).

---

## 2. W6-A — Substrate (migration 0042 + aggregation jobs)

### 2.1 Migration 0042 (`drizzle/migrations/0042_analytics_substrate.sql` + schema.ts + journal)

Adds, in one migration:

1. `ALTER TABLE restaurants ADD COLUMN timezone varchar(64) NOT NULL DEFAULT 'Europe/Bucharest';`
2. **`reservation_daily_aggregates`** — PK `(restaurant_id, business_date, service_label)`. Columns
   per §07 §4.1, with the **channel-source columns kept as the doc's 7** (`source_widget`,
   `source_venue_page`, `source_editorial`, `source_corporate`, `source_walk_in`, `source_manual`,
   `source_unknown`) and the **9→7 fold** defined in §2.3. Indexes on `(business_date desc)` and
   `(restaurant_id, business_date desc)`.
3. **`reservation_hourly_aggregates`** (Pro) — §4.2. PK `(restaurant_id, day_of_week, hour_of_day,
   window_end_date)`.
4. **`diner_cohort_aggregates`** (Pro, **org-scoped**) — §4.3. PK `(organization_id, cohort_month,
   month_offset)`.
5. **`restaurant_forecasts`** (Pro) — §6.2. PK `(restaurant_id, forecast_date)`.
6. **`restaurant_export_jobs`** — §4.4. (`requested_by_user_id` → `auth.users(id)`; `requested_
   restaurants uuid[]`; `tables text[]`; `status queued|running|ready|expired|failed`; storage/expiry
   columns.) Indexes per doc.
7. **SQL function** `analytics_service_label_for_hour(t time) returns varchar(40)` — the §5.1a fixed
   lookup (brunch/lunch/dinner/late windows, tie-break to earlier service, else `all_day`).
   Restaurant-agnostic in v1 (no per-venue service blocks yet) → signature takes only `time`.
8. **Private storage bucket** `exports`: `insert into storage.buckets (id,name,public,file_size_
   limit) values ('exports','exports',false, 1073741824)` (1 GB cap) — mirrors `0002_storage_bucket`.
9. **RLS** (§4.5) on the four analytics tables + export-jobs: org members read aggregates for their
   org (join through `restaurants.organization_id` for restaurant-scoped tables; direct
   `organization_id` for cohort/export); org admins insert export jobs for their org; service-role
   (jobs) bypasses; Tavli admin sees all. Storage `exports` bucket: only service-role writes; reads
   are via signed URL only (no public/anon read policy).

Drizzle table defs added to `src/lib/db/schema.ts`; `_journal.json` appended (idx+1, same version,
`Date.now()`, tag `0042_analytics_substrate`, `breakpoints:true`). Applied locally via
`psql "$DATABASE_URL" -f` (NOT `drizzle-kit migrate` — it stalls on the drifted local DB).

### 2.2 JOBS registry additions (`src/lib/jobs/keys.ts`)

Extend `analytics` (single-word domain, kebab action, no underscores — passes `keys.test.ts`):

```ts
analytics: {
  weeklySummary: "analytics.weekly-summary",        // exists
  refreshCohorts: "analytics.refresh-cohorts",      // exists
  refreshAggregates: "analytics.refresh-aggregates", // NEW
  backfillAggregates: "analytics.backfill-aggregates", // NEW
  runExport: "analytics.run-export",                // NEW
  expireStaleExports: "analytics.expire-stale-exports", // NEW
  purgeStaleHourlyWindows: "analytics.purge-stale-hourly-windows", // NEW
},
```

### 2.3 `analytics.refresh-aggregates` job (`src/lib/analytics/refresh-aggregates.ts`)

`makeRefreshAggregates({db})` → handler. **Per restaurant** (handler loops all non-archived
restaurants; cron = one global nightly run, §2.6):

1. `business_date = ((now() at time zone r.timezone)::date - interval '1 day')`.
2. **Daily upsert** into `reservation_daily_aggregates` from `reservations` filtered to
   `restaurant_id` + `reservation_date = business_date`, grouped by
   `analytics_service_label_for_hour(reservation_time)`. Counts/covers/party-buckets/cancel-reason/
   booking-type per §4.1. `ON CONFLICT (restaurant_id, business_date, service_label) DO UPDATE`
   (idempotent).
   - **Cancel-reason buckets** map from the free-text `cancelledReason` via a fixed `CASE` (the
     structured values the app writes: `restaurant_closed|overbooked|kitchen_issue|private_event|
     other`); diner-initiated cancels (status `cancelled`, `cancelledReason IS NULL`) →
     `cancel_reason_diner`.
   - **Channel-source 9→7 fold:** join `reservations.diner_id → diners`; bucket by
     `acquisitionSource`: `widget|venue_page|editorial|corporate|walk_in|manual` map 1:1;
     `import`,`api` → `source_manual`; `email_campaign` → `source_unknown` (marketing attribution is
     §11's); `null` / no `diner_id` → `source_unknown`.
   - **new/returning diners:** `new_diners` = distinct diners whose `firstVisitedAt::date (at venue
     tz) = business_date`; `returning_diners` = the rest.
3. **Lead-time percentiles** (separate UPDATE): `percentile_cont(0.5|0.9)` and `avg` over
   `extract(epoch from ( ((reservation_date + reservation_time) at time zone r.timezone) - created_at ))/60`
   for non-cancelled rows on `business_date`. (Constructing the timestamptz via `AT TIME ZONE` is
   required because `created_at` is timestamptz and `date+time` is not — verified gap.)
4. **Hourly aggregates** (Pro): recompute the 90-day rolling window ending `business_date`, one row
   per `(day_of_week, hour_of_day, window_end_date=business_date)`.
5. **Forecast** (Pro): the §6.1 trimmed-mean estimator over the last 12 same-weekday observations
   for each of the next 28 days; require ≥12 obs else null; upsert `restaurant_forecasts`.

**Tested cores (pure, no DB):** `serviceLabelForHour(time)` (mirror of the SQL fn for unit testing),
`foldAcquisitionSource(src)`, `mapCancelReason(text)`, `trimmedMeanForecast(observations)` (incl.
the <12-obs → null branch + IQR band), `cohortRetention(...)` (§2.4). DB-touching upsert paths get
thin integration coverage with an injected fake `db`.

### 2.4 `analytics.refresh-cohorts` job (`src/lib/analytics/refresh-cohorts.ts`)

Already-registered key. **Per org.** Recompute the **current `cohort_month`** rows (offsets 0…24)
from scratch; **past months immutable** — `ON CONFLICT ... DO UPDATE ... WHERE excluded.cohort_month
>= date_trunc('month', now())` (§5.1b). Org-scoped read across the org's restaurants' reservations +
diners. Admin manual backfill (bypassing immutability) writes `AUDIT.analytics.cohort_manually_
overridden` — that admin path is **out of W6 build scope** (forward-noted only).

### 2.5 `analytics.backfill-aggregates` job (`src/lib/analytics/backfill-aggregates.ts`)

One-time, restartable from last completed `(restaurant_id, business_date)`; loops every (restaurant,
day) from the earliest reservation to yesterday, calling the same daily/hourly/cohort/forecast
computation. Heartbeat row-count for the dashboard "Computing aggregates…" banner (§5.2). Enqueued
on-demand (admin), never scheduled.

### 2.6 Worker wiring (`scripts/worker.ts`)

- `boss.work(JOBS.analytics.refreshAggregates, …)` + `boss.schedule(…, "0 1 * * *")` (≈03:00/04:00
  Bucharest — safely past close; handler derives each venue's `business_date` from its tz).
- `boss.work(JOBS.analytics.refreshCohorts, …)` + same nightly schedule (runs after aggregates).
- `boss.work(JOBS.analytics.backfillAggregates, …)` (no schedule).
- (run-export / expire-stale-exports / purge-stale-hourly-windows wired in W6-B / §2.7.)

### 2.7 Cleanup jobs

- `analytics.purge-stale-hourly-windows` — weekly; `delete from reservation_hourly_aggregates where
  window_end_date < (now()::date - interval '90 days')`. Wired here (W6-A).
- `analytics.expire-stale-exports` — nightly 04:00 UTC; wired in W6-B (needs the export bucket).

### 2.8 Error codes

Add as needed in TV500–TV599 (existing: TV501 `export_too_large`, TV502 `no_data_in_window`).
Anticipated: `TV503 backfill_in_progress` (if a second backfill is requested while one runs).

---

## 3. W6-B — Async export (`run-export` ZIP + PII audit + cancel-seam)

### 3.1 Create-export action (`src/app/partner/(dashboard)/analytics/export-actions.ts`)

`"use server"` `requestAnalyticsExport(input)`:
1. `requireCan(session, "analytics.export", orgSubject)`; if `tables` includes `"campaigns"`, also
   `requireCan(session, "campaigns.read", orgSubject)` (§8 permission boundary — the **only** gate;
   the job trusts the row).
2. Insert `restaurant_export_jobs` (status `queued`, scope, date range, tables, format).
3. `enqueue(JOBS.analytics.runExport, { jobId })`.
4. Return `{ ok:true, data:{ jobId } }`. No `bypass_tier_limit_reason` accepted from user input.

### 3.2 `analytics.run-export` job (`src/lib/analytics/run-export.ts`)

`makeRunExport({db, storage, sendEmail, recordAudit})`:
1. Set `status='running'`.
2. **Stream** a ZIP to a temp file with **`archiver`** (new dep — chosen over `jszip` for §8.3's
   "don't load all rows into memory"). Iterate `job.tables ⊆ {reservations,diners,reviews,campaigns}`;
   one streamed CSV per table via `csvStringify` over a chunked/cursor query. Apply the venue-local
   12-month filter for Base orgs unless `bypass_tier_limit_reason` is set (§3.3/§11).
3. Upload to private `exports` bucket at `org/<org_id>/<job_id>.zip`.
4. `createSignedUrl(path, 24*3600)`.
5. Update row: `status='ready'`, `storage_path`, `signed_url_expires_at = now()+24h`, `row_count`,
   `size_bytes`, `ready_at`.
6. **PII-access audit (every export):** one `AUDIT.diner.pii_accessed` row keyed on the job
   (`context:{access_kind:'export', job_id, row_count, tables, date_from, date_to}` — IDs/counts
   only, no PII → satisfies the 4 KB / PII-key-rejection constraint). Plus one
   `AUDIT.analytics.export_run` (`actor_user_id, actor_ip, org_id, restaurant_ids[], tables[],
   date range, bypass_tier_limit_reason|null, restaurant_export_jobs.id`).
7. Send `ExportReadyEmail` (signed URL) to requester.
8. Schedule/handle cleanup at expiry (delete file + `status='expired'`) via
   `analytics.expire-stale-exports`.

On failure: `status='failed'`, `failure_reason`; throws `TV5xx` from the lib core for the worker
retry/backoff. `TV501 export_too_large` if projected size exceeds the bucket cap.

### 3.3 `bypass_tier_limit_reason` override (§8.3) — closes the W5-F seam

`runExport` accepts `bypass_tier_limit_reason: 'subscription_cancellation' | 'gdpr_data_subject_
request' | 'tavli_admin_override'` **only** via internal callers (not the user action). Wire
`cancel-subscription.ts`'s existing data-export TODO seam to enqueue a full export with
`bypass_tier_limit_reason:'subscription_cancellation'`. Bypass exports skip the 12-month filter and
always set `export_run.bypass_tier_limit_reason`.

### 3.4 `ExportReadyEmail` (`src/emails/ExportReadyEmail.tsx`)

Per-locale `COPY` (RO/EN/DE) + `getSubject(locale)`; props `{downloadUrl, expiresAt, tables,
locale}`. Render-mock test per the §1.8 gotcha.

### 3.5 `analytics.expire-stale-exports` job (`src/lib/analytics/expire-stale-exports.ts`)

Nightly 04:00 UTC: for `status='ready'` rows past `signed_url_expires_at`, delete the storage object
and set `status='expired'`, `expired_at`. Wired in `worker.ts` here.

---

## 4. W6-C — Weekly summary digest

### 4.1 `analytics.weekly-summary` job (`src/lib/analytics/weekly-summary.ts`)

Already-registered key. **Per restaurant**, cron `"0 18 * * 0"` UTC (≈20:00/21:00 Bucharest Sunday).
`makeWeeklySummary({db, sendEmail})`:
1. Resolve last completed business-week (venue-local) bounds.
2. Assemble from `reservation_daily_aggregates`: bookings/covers/completed/no-shows/cancellations +
   WoW deltas; reviews count + avg (from `reviews`); Pro: top traffic source + next-week forecast
   total (`restaurant_forecasts`). Skip "top dishes" (§08 not landed) and YoY (<1yr data) per §9/§13.
3. **Audience:** every `organization_members` with role ∈ {owner, admin, manager} for the venue's
   org. Locale = member's `profile.locale` → restaurant fallback → `ro`.
4. Send `WeeklySummaryEmail`; write `AUDIT.analytics.weekly_summary_sent` (`{restaurant_id, week_
   start, week_end, recipients}`).

### 4.2 `WeeklySummaryEmail` (`src/emails/WeeklySummaryEmail.tsx`)

Per-locale `COPY` (RO/EN/DE) + `getSubject(locale, {restaurantName})`. Up/down delta arrows; Pro
section conditional on the passed `tier`. Render-mock test.

**Tested cores:** `computeWeekOverWeekDeltas(...)`, `resolveWeeklyAudience(members)`, the week-bounds
math — all pure. Job DB paths covered with injected fake `db`/`sendEmail`.

---

## 5. W6-D — Dashboards (Recharts, editorial, hardcoded Romanian)

### 5.1 Routes & data layer

- **Base + Pro restaurant dashboard:** `/partner/(dashboard)/analytics` (reconciled from the doc's
  `/partner/restaurants/[id]/analytics` to the real `(dashboard)` route group;
  `currentUserPrimaryRestaurant(session)` resolves the venue, mirroring existing pages).
- **Org rollup:** `/partner/org/[orgId]/analytics` (mirrors the existing
  `/partner/org/[orgId]/venues` membership-check pattern).
- **Data functions** (`src/lib/analytics/queries.ts`, pure read helpers + `makeAnalyticsQueries({db})`):
  this-week vs last-week overview, covers-per-service (30d), no-show trend (90d), party-mix (90d),
  cancellation-reason donut (90d), and Pro: heat-map (latest hourly window), cohort triangle,
  lead-time histogram (5 buckets), channel attribution (stacked area), forecast (28d). Each unions
  **aggregates for past days + real-time `reservations` for today** (§5.3). Org rollup sums per-venue
  rows (`union all`/`sum`); lead-time percentiles recomputed from source for org views (§7.3).

### 5.2 Tier gating

Server-side **and** UI: `const sub = await loadActiveSubscription(orgId)`. Pro charts render only
when `sub?.tier === 'pro' && sub.status === 'active'`; Base orgs see an "Upgrade to Pro" CTA in those
slots. Base dashboard queries apply the venue-local 12-month filter (§3.3/§11); Pro = no date cap.
**No `FOR SHARE` lock in v1** — `cache()`-memoized single read per request + the accepted §11.1 #3
"no downgrade mid-stream" rule. (Forward-noted for live-billing hardening.)

### 5.3 Charts & states

Recharts (dynamic partner route → out of public bundle). House style: Tailwind v4 tokens
(`brand-primary` #F97316, `surface-white`, `rounded-card`, Inter/Fraunces), `StatCard`, `Button`,
existing tab/card patterns. Empty/sparse states per §7.1.1 (0-ever placeholder cards; <14 "small
sample" footnote; partial-window label; forecast "after 12 weeks"; heat map "after 30 days").
**Export modal** (date range / venues / includes) → calls `requestAnalyticsExport` → "preparing,
we'll email a link (~5 min)". `frontend-design`-skill pass for the editorial bar
(`feedback_aesthetic_bar`); **visual review deferred** to a running-app session (per the user's
locked decision this wave).

---

## 6. Cross-cutting decisions (locked)

1. **`restaurants.timezone` added** (default `Europe/Bucharest`) — the anchor for all venue-local math.
2. **Dashboards hardcoded Romanian** (match house style; no `next-intl`). **Emails RO/EN/DE** via the
   existing `COPY`+`getSubject` pattern.
3. **Private `exports` bucket + 24h signed URLs** (PII).
4. **`archiver`** for streaming ZIP; **`recharts`** for charts — the two new deps.
5. **`FOR SHARE` lock deferred** (§5.2 rationale).
6. **`refresh-aggregates` (per-restaurant) + `refresh-cohorts` (per-org)** as two nightly passes —
   resolves the §5/§5.1b/§10 ambiguity. Channel-source 9→7 fold + cancel-reason text→bucket map
   defined in §2.3.
7. **Existing sync `bulkExportReservations` kept**; async ZIP job is the large/multi-table/org path,
   reusing `csvStringify`.
8. **Admin cohort-override & org-aggregate (>10 venues) tables = out of W6 scope** (v1.5 / forward-noted).

## 7. Conventions (carried from Wave 5)

DI-mocked external clients; lib `make*({deps})` throws `TV5xx`; app `"use server"` wraps via
`toResult` → `{ok:true,data}|{ok:false,error}`; migration recipe (schema.ts + raw SQL + journal,
`psql -f` locally); JOBS single-word-domain/kebab/no-underscore; email render-mock test gotcha;
audit via `recordAudit` + `AUDIT.analytics.*`; TDD per piece → `npx tsc --noEmit` (exit checked
directly) → commit tagged `(§07 Wave 6 sub-unit X.N)`.

## 8. Out of scope (Wave 6)

Marketing-campaign analytics (§11); per-diner review aggregates (§06); GDPR cross-domain export
orchestration (§13 — this wave supplies the bookings/analytics slice + the cancel-export seam);
top-dishes in weekly email (§08); YoY weekly comparison (<1yr); custom date-range picker (v1.5);
org-aggregate table for >10-venue chains (v1.5); websocket/real-time dashboard (v1.5); admin
cohort-backfill UI; the §11.1 `FOR SHARE` lock (live-billing hardening).
