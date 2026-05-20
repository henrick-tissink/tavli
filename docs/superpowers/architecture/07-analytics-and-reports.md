# 07 — Analytics & Reports

> Booking history retention, CSV exports, weekly summary email, and the Pro-tier advanced dashboards (no-show heat map, cohort retention, lead-time distribution, channel attribution, 4-week cover forecast).

**Dependencies:** last verified compatible with `00-foundations.md` 2026-05-20. Re-check on foundations contract changes — specifically §3.2 `ActionResult<T>`, §3.4 `can()`/`requireCan()` (`analytics.read` + `analytics.export` permissions), §11.5 timezone canonical pattern (venue-local date filter for retention windows), §15a.1 GDPR erasure (PII-bearing tables filter `redacted_at IS NULL` in aggregates), §16.1 ERROR_CODES (TV500–TV599 owned here), §16.2 AUDIT (`AUDIT.analytics.*` + `AUDIT.diner.pii_accessed` for exports), §16.3 JOBS (`analytics.*` family).

## Contents

- [1. Scope](#1-scope)
- [2. Current state](#2-current-state)
- [3. Architectural pillars](#3-architectural-pillars) — pre-aggregation, retention as archive, venue-local date math, async exports
- [4. Data model](#4-data-model) — `reservation_daily_aggregates`, hourly, cohort, forecast, export jobs
- [5. Aggregation job](#5-aggregation-job) — refresh, service-label heuristic (§5.1a), cohort recompute (§5.1b), backfill
- [6. Forecast (Pro)](#6-forecast-pro)
- [7. UI surfaces (partner portal)](#7-ui-surfaces-partner-portal) — Base + Pro dashboards, org rollup, empty/sparse states
- [8. CSV export](#8-csv-export)
- [9. Weekly summary email](#9-weekly-summary-email)
- [10. Background jobs](#10-background-jobs)
- [11. Tier enforcement](#11-tier-enforcement) — subscription-state race resolution (§11.1)
- [12. Build sequence](#12-build-sequence) — W8 vs W12 split per LFC §5
- [13. Open questions](#13-open-questions)
- [14. Cross-references](#14-cross-references)

## 1. Scope

This domain owns: pre-computed aggregates that power dashboards, the CSV export pipeline for the contractual data-export promise, the weekly summary email, and the dashboard UI surfaces.

It does **not** own: marketing-campaign performance analytics (→ §11 — campaign-specific metrics live with the campaign), per-diner review history aggregates (→ §06), GDPR data export (→ §13 — orchestrates exports across domains; this doc supplies the bookings + analytics slice).

### Checkboxes covered

Status markers per README: `[ ]` = unshipped, `[x]` = shipped.

From LFC §1 Tavli (Base):
- [ ] 12 months of booking history *(retention as archive — see §3.3 + §11)*
- [ ] CSV export of bookings, diners, reviews, campaigns *(async job — see §8)*
- [ ] Covers-per-service report
- [ ] No-show rate report
- [ ] Party-size mix report
- [ ] Cancellation-reason breakdown
- [ ] Weekly summary email (Sunday night) *(see §9)*

From §2 Tavli Pro **(W12 launch — "coming soon" labels at W8 per `launch-feature-commitments.md` §5):**
- [ ] Unlimited booking-history retention (not 12-month cap)
- [ ] No-show heat map (day-of-week × time-of-day)
- [ ] Cohort retention (returning vs new, MoM)
- [ ] Lead-time distribution
- [ ] Channel attribution dashboard
- [ ] 4-week rolling cover forecast

**Locked decision (pre-release):** W8 launch ships Base dashboards only. The five Pro dashboards above ship at W12. Saves ~5 days at W8 sprint without reducing total scope. The pricing page shows "Advanced analytics — rolling out this quarter" on Pro for the first 4 weeks.

## 2. Current state

**Exists:**
- `reservations` table with structured data needed for most analytics (status, party_size, reservation_date, reservation_time, booking_type, cancelled_reason, restaurant_id).
- `reviews` table with `rating`, `created_at`, FK to reservation.
- The DB trigger on `reviews` already pre-computes `restaurants.rating + vote_count` — a tiny existing example of the pattern this doc generalises.
- Drizzle queries can produce real-time aggregates on the existing data, but no UI surface or scheduled jobs do so today.

**Missing:**
- No pre-computed aggregates table. Every dashboard would require a full table scan if built today.
- No CSV export endpoint or job.
- No weekly summary email template (§04 owns the template; this doc owns the data assembly + send trigger).
- No dashboards at all.
- No 12-month retention enforcement (Base tier limit).
- No forecast logic.

## 3. Architectural pillars

### 3.1 Pre-computed daily aggregates, refreshed by nightly job

Dashboards must render in <500ms even at 100k bookings per org. Real-time aggregation against `reservations` won't survive that load. Solution: daily aggregates pre-computed and stored in a flat table, indexed by `(restaurant_id, date)`.

**Worked example (why pre-aggregation is worth the pipeline):** A 100-table chain doing 500 bookings/day across 365 days produces ~182k reservations per year. Hitting `reservations` directly for "covers per service, last 90 days" requires scanning ~45k rows; in Supabase that's ~800ms even with the existing `(restaurant_id, reservation_date)` index because of the per-row party-size sum + service-label lateral. Reading `reservation_daily_aggregates` for the same window scans ~270 rows (90 days × ~3 service labels) and returns in ~5ms. The ~100× speedup justifies the nightly job + extra table.

A nightly pg-boss job (`analytics.refresh-aggregates`) runs at 02:00 in each restaurant's timezone (staggered to spread DB load), computes the previous 24h's aggregates, and upserts.

Real-time data for the current day is queried directly against `reservations` (a single day's data is small).

### 3.2 Two aggregation tiers

- **Daily aggregates** (`reservation_daily_aggregates`) — covers most Base + Pro reports.
- **Per-bucket aggregates** (`reservation_hourly_aggregates` for heat map; `diner_cohort_aggregates` for retention) — Pro-only, separate tables to keep daily simple.

### 3.3 Retention is a tier-aware archive, not a hard delete

Base tier "12-month history" doesn't mean we delete older data — it means we don't *show* it. The reservation rows stay (covers contractual export promises, ANPC audit). Queries from the Base dashboard add a venue-local date filter — explicitly **not** `now() - interval '12 months'` against a UTC `timestamptz`, which would slide the day boundary by up to 23h for venues east of UTC. Per foundations §11.5 (timezone canonical pattern), all analytics date-window filters use the restaurant's local date:

```sql
where reservation_date >= (
  (now() at time zone restaurant.timezone)::date - interval '12 months'
)
```

The index `(restaurant_id, reservation_date)` covers this filter. The cohort aggregation job stores venue-local dates in `analytics_cohorts.business_date` (already a `date` type, not `timestamptz`) so cohort boundaries follow the venue's calendar, not the server's. This rule applies to every date-window predicate in this doc — `now() - interval '12 months'` shown elsewhere is shorthand for the venue-local form above.

This avoids two problems:
- Hard delete loses the right-to-portability data the GDPR contract promises.
- Forcing a re-import on upgrade (Base → Pro) is bad UX.

### 3.4 Exports are async

CSV export of all reservations for an org could be 100k+ rows. Exports run as pg-boss jobs, save the file to Supabase Storage, send a signed-URL email to the requester.

## 4. Data model

### 4.1 New table: `reservation_daily_aggregates`

```sql
create table reservation_daily_aggregates (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  business_date date not null,                               -- restaurant-local date
  service_label varchar(40) not null default 'all_day',      -- 'lunch' | 'dinner' | 'brunch' | 'all_day'

  -- Counts
  bookings_created integer not null default 0,                -- reservations created on this date (any future visit date)
  bookings_for_date integer not null default 0,               -- reservations whose reservation_date = business_date
  confirmed_count integer not null default 0,
  seated_count integer not null default 0,
  completed_count integer not null default 0,
  no_show_count integer not null default 0,
  cancelled_count integer not null default 0,

  -- Covers (sum of party_size)
  covers_for_date integer not null default 0,
  covers_completed integer not null default 0,
  covers_no_show integer not null default 0,

  -- Party-size buckets (counts of reservations)
  party_size_1_2 integer not null default 0,
  party_size_3_4 integer not null default 0,
  party_size_5_6 integer not null default 0,
  party_size_7_plus integer not null default 0,

  -- Cancellation reasons (counts)
  cancel_reason_restaurant_closed integer not null default 0,
  cancel_reason_overbooked integer not null default 0,
  cancel_reason_kitchen_issue integer not null default 0,
  cancel_reason_private_event integer not null default 0,
  cancel_reason_other integer not null default 0,
  cancel_reason_diner integer not null default 0,             -- diner-initiated cancels (no structured reason)

  -- Booking-type buckets
  booking_type_standard integer not null default 0,
  booking_type_private_event integer not null default 0,
  booking_type_standing integer not null default 0,

  -- Lead time (minutes between booking creation and reservation_at)
  lead_time_p50_min integer,                                  -- median
  lead_time_p90_min integer,
  lead_time_avg_min integer,

  -- Channel attribution (counts; sourced from diners.acquisition_source where the linked diner was newly created)
  source_widget integer not null default 0,
  source_venue_page integer not null default 0,
  source_editorial integer not null default 0,
  source_corporate integer not null default 0,
  source_walk_in integer not null default 0,
  source_manual integer not null default 0,
  source_unknown integer not null default 0,

  -- New vs returning (Pro)
  new_diners integer not null default 0,                      -- diners with first_visited_at = business_date
  returning_diners integer not null default 0,

  -- Computed at refresh time
  computed_at timestamptz not null default now(),

  primary key (restaurant_id, business_date, service_label)
);

create index reservation_daily_aggregates_date on reservation_daily_aggregates (business_date desc);
create index reservation_daily_aggregates_restaurant on reservation_daily_aggregates (restaurant_id, business_date desc);
```

Service-label split lets a restaurant report "lunch covers vs dinner covers" without re-aggregating. `'all_day'` is the default for restaurants without service splits.

### 4.2 New table: `reservation_hourly_aggregates` (Pro)

For the no-show heat map: day-of-week × time-of-day.

```sql
create table reservation_hourly_aggregates (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  hour_of_day smallint not null check (hour_of_day between 0 and 23),
  window_start_date date not null,                            -- start of the 90-day rolling window represented
  window_end_date date not null,

  total_bookings integer not null default 0,
  no_show_count integer not null default 0,
  no_show_rate numeric(5, 4),                                 -- no_show_count / nullif(total_bookings, 0)

  computed_at timestamptz not null default now(),
  primary key (restaurant_id, day_of_week, hour_of_day, window_end_date)
);
```

A new row is written for each refresh (window_end_date changes daily). Old windows kept for 90 days then purged. The heat map UI queries the latest window per (day_of_week, hour_of_day).

### 4.3 New table: `diner_cohort_aggregates` (Pro)

For the cohort-retention dashboard: of the diners who first visited in month M, what fraction visited again in M+1, M+2, …, M+12.

```sql
create table diner_cohort_aggregates (
  organization_id uuid not null references organizations(id) on delete cascade,
  cohort_month date not null,                                 -- first day of month diner first visited
  month_offset smallint not null check (month_offset between 0 and 24),
  cohort_size integer not null,
  retained_count integer not null,                            -- diners from this cohort who visited again in cohort_month + month_offset
  retention_rate numeric(5, 4),
  computed_at timestamptz not null default now(),
  primary key (organization_id, cohort_month, month_offset)
);
```

Org-scoped, not restaurant-scoped: cohorts at the org level read more naturally (a Pro chain wants "Tom Yum Group's retention," not per-venue).

### 4.4 New table: `restaurant_export_jobs`

```sql
create table restaurant_export_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  requested_by_user_id uuid not null references auth.users(id),
  requested_restaurants uuid[] not null,                       -- which venues; empty = all in org
  format varchar(20) not null default 'csv',                   -- 'csv' | 'json'
  date_from date,
  date_to date,
  tables text[] not null default array['reservations', 'diners', 'reviews']::text[],
    -- which tables to include; allowed values: 'reservations' | 'diners' | 'reviews' | 'campaigns'.
    -- The job is generic: it iterates the requested tables and exports each one.
    -- Permission checks (e.g. `can('campaigns.read', org)` per foundations §3.4 + the registry in §16)
    -- are enforced at the *action* layer that creates this row — not inside the export job.
  status varchar(20) not null default 'queued',                -- 'queued' | 'running' | 'ready' | 'expired' | 'failed'
  storage_path text,                                            -- path in 'exports' bucket
  signed_url_expires_at timestamptz,                           -- 24h from ready
  row_count integer,
  size_bytes bigint,
  failure_reason text,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  expired_at timestamptz
);

create index restaurant_export_jobs_org on restaurant_export_jobs (organization_id, created_at desc);
create index restaurant_export_jobs_status on restaurant_export_jobs (status) where status in ('queued', 'running');
```

A new `exports` storage bucket holds the generated files. 24h signed-URL expiry; after that the file is purged by the same cleanup job.

### 4.5 RLS

All four tables: org members can read aggregates for their org; org admins can request exports for their org; Tavli admin sees everything.

## 5. Aggregation job

### 5.1 `analytics.refresh-aggregates`

Per restaurant, scheduled at 02:00 local. The job:

1. Determines `business_date = (now() in restaurant TZ) - interval '1 day'` (the day that just ended).
2. Computes the daily aggregate for that date from `reservations`. SQL:

```sql
insert into reservation_daily_aggregates (
  restaurant_id, business_date, service_label, ...
)
select
  r.restaurant_id,
  r.reservation_date,
  coalesce(m.service_label, 'all_day') as service_label,

  count(*) filter (where r.created_at::date = $business_date) as bookings_created,
  count(*) as bookings_for_date,
  count(*) filter (where r.status = 'confirmed') as confirmed_count,
  ...
from reservations r
left join lateral (
  -- See §5.1a for the canonical service-label heuristic. The lateral matches r.reservation_time's hour
  -- to the service-label window with the tightest fit (ties to the earlier service).
  select service_label from analytics_service_label_for_hour(r.restaurant_id, r.reservation_time)
) m on true
where r.restaurant_id = $restaurant_id
  and r.reservation_date = $business_date
group by r.restaurant_id, r.reservation_date, m.service_label
on conflict (restaurant_id, business_date, service_label)
do update set
  bookings_created = excluded.bookings_created,
  ...
  computed_at = now();
```

3. Computes lead time percentiles for the same day:

```sql
update reservation_daily_aggregates
set
  lead_time_p50_min = (
    select percentile_cont(0.5) within group (order by extract(epoch from (
      (r.reservation_date::timestamp + r.reservation_time) - r.created_at
    )) / 60)
    from reservations r
    where r.restaurant_id = $restaurant_id
      and r.reservation_date = $business_date
      and r.status not in ('cancelled')
  ),
  ...
where restaurant_id = $restaurant_id and business_date = $business_date;
```

4. Updates the hourly aggregates (90-day rolling window) for this restaurant.
5. Updates cohort aggregates (see §5.1b for the recompute-vs-carry-forward rule).

The job is **idempotent**: re-running for the same `(restaurant_id, business_date)` produces the same result and overwrites.

### 5.1a Service-label heuristic (canonical)

The aggregate job maps each reservation's `reservation_time` (a `time` value in venue-local clock) to a `service_label` bucket. The mapping is a fixed lookup, not a per-menu join — restaurants without explicit service splits all reduce to the same buckets, and the schema is easier to evolve than a free-text-driven map.

| service_label | typical_hour | window         | notes                          |
|---------------|--------------|----------------|--------------------------------|
| `brunch`      | 11           | 10:00–13:00    |                                |
| `lunch`       | 12           | 11:00–15:00    |                                |
| `dinner`      | 19           | 17:00–23:00    |                                |
| `late`        | 22           | 21:00–02:00    | wraps midnight                 |

**Matching rule:**
- For each reservation, compare `reservation_time` against each label's window (windows are inclusive of start, exclusive of end).
- Multiple windows can match (e.g. 12:30 fits both `brunch` 10:00–13:00 and `lunch` 11:00–15:00; 22:00 fits both `dinner` 17:00–23:00 and `late` 21:00–02:00).
- **Tie-break: pick the earlier service** (brunch beats lunch at 12:30; dinner beats late at 22:00).
- If no window matches (e.g. 15:30 falls between `lunch` ending at 15:00 and `dinner` starting at 17:00; or 03:00 outside everything except `late` which has already ended), label is `all_day`.

Encoded as the SQL function `analytics_service_label_for_hour(restaurant_id, t time)` referenced in the aggregate query above. Restaurants with bespoke service blocks (e.g. tea service 15:00–17:00) — out of v1 scope; revisit in v1.5 if any operator complaint surfaces.

### 5.1b Cohort recompute vs carry-forward (canonical)

Earlier drafts contained a contradiction between "re-computes the current month's row" and "previous 24 months' carry-forward." The resolution:

**On each nightly refresh (`analytics.refresh-cohorts`, one run per restaurant):**
- The **current `cohort_month`** (the month containing the run date) has *all* its `month_offset` rows (0…24) recomputed from scratch. Diners are still adding visits this month, so the cohort_size + retained_count fields are mutable until the month ends.
- **Past `cohort_month`s** (older than the current calendar month) are **immutable** once their month has closed: their rows are carried forward unchanged. They are never recomputed, even if a late-arriving correction would change them — the trade-off accepted to keep the job O(N) per night rather than O(N²).
- If a manual backfill is required (e.g. data correction after migration), it's an explicit admin-run script that bypasses the immutability rule and re-writes the affected `cohort_month` rows. Audit-logged.

**Enforcement of past-month immutability** is by job code logic only — there is no CHECK constraint or trigger that prevents an `UPDATE analytics_cohorts WHERE cohort_month < date_trunc('month', now())`. The trade-off: a DB-layer guard would prevent the legitimate admin-backfill script. Mitigations:
- The `analytics.refresh-cohorts` job inserts `ON CONFLICT (restaurant_id, cohort_month, month_offset) DO UPDATE SET ... WHERE excluded.cohort_month >= date_trunc('month', now())` — i.e. the conflict resolver skips past months by design.
- Direct `UPDATE`s by humans/admins write to `audit_logs` via the `analytics.cohort_manually_overridden` action (registered in foundations §16.2). Tavli admin dashboard surfaces these for review.

The job name `analytics.refresh-cohorts` is registered in foundations §16.3 (job registry).

### 5.2 Backfill

After the table lands, run a one-time admin script: for every (restaurant, day) since the earliest reservation, compute the aggregate. ~100ms per row; ~10s per restaurant for a year of data. Manageable.

**Async behaviour during backfill:** the backfill runs as a pg-boss job (`analytics.backfill-aggregates`), not synchronously inside the migration. For a 100-restaurant chain, the backfill window is ~10–20 minutes. While it runs, the dashboards display a `Computing aggregates… (live data still available)` banner with a progress indicator (rows-processed / total) sourced from the job's heartbeat. Today's real-time queries continue to work unaffected. Backfill is restartable from the last completed `(restaurant_id, business_date)` if interrupted.

### 5.3 Real-time delta for today

The dashboard's "today" view doesn't read aggregates — it reads `reservations` directly with a `where reservation_date = current_business_date` filter. A small enough dataset to render fast.

When the user is looking at "this week," the query unions: aggregates for past days + real-time for today.

## 6. Forecast (Pro)

### 6.1 Algorithm

4-week rolling cover forecast — per restaurant, predicts covers for each of the next 28 days.

For each future day D in the next 28:
1. Require **≥ 12 same-weekday observations** (per §7.1.1; below that threshold, return null and show the "needs 12 weeks" empty-state).
2. Compute the last 12 same-weekday observations (e.g., for next Tuesday, last 12 Tuesdays).
3. Forecast = trimmed mean (drop top + bottom outlier) of those 12 observations.
4. Confidence band = ±1.5 × interquartile range.
5. Apply day-of-month adjustment if there's signal (e.g., first weekend of month has +20% vs other weekends — only apply if effect size > 10%).

This is a deliberately simple model. Not ML, not a library. The point is to give restaurants a "feel" for the week, not to be perfectly predictive.

### 6.2 Where it runs

Inside the nightly aggregate refresh, append a 28-day forward forecast for the restaurant. Store in a small `restaurant_forecasts` table:

```sql
create table restaurant_forecasts (
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  forecast_date date not null,                                -- future date being predicted
  covers_predicted integer not null,
  covers_low integer not null,
  covers_high integer not null,
  bookings_already_confirmed integer not null default 0,      -- snapshot at refresh time
  computed_at timestamptz not null default now(),
  primary key (restaurant_id, forecast_date)
);
```

The dashboard shows: forecast bar chart with confirmed-bookings overlay so the operator can see "we're already 30% booked vs forecast."

## 7. UI surfaces (partner portal)

### 7.1 Base dashboards

Route: `/partner/restaurants/[id]/analytics`.

Tabs (rendered as page sections, single scroll):
1. **Overview**: this-week vs last-week — bookings, covers, no-shows, completed.
2. **Covers per service**: bar chart by service_label across last 30 days.
3. **No-show rate**: line chart, 90-day trend.
4. **Party size mix**: stacked bar across 90 days.
5. **Cancellation reasons**: donut chart for last 90 days.
6. **Export**: button to trigger a CSV export.

All Base reports query `reservation_daily_aggregates` + today's real-time delta.

### 7.1.1 Empty + sparse states

A new restaurant on day 1 has zero historical reservations. Aggregates either don't exist or are zero. Dashboards must render coherently anyway.

Rules:
- **0 reservations ever:** every chart shows a placeholder card — "Once you take your first bookings, this is where you'll see [chart description]." No empty axes; no zero-data line/bar that reads as "no business."
- **< 14 reservations in the window:** show the chart with whatever data exists, plus a "Small sample — interpret cautiously" footnote. Don't fake confidence.
- **Aggregates exist but for fewer days than the chart period:** show partial data with a clear "showing data from DD MMM" label.

The forecast chart specifically requires **≥ 12 weeks of operation** to ground the trimmed-mean estimator — i.e. at least 12 observations per weekday × 7 weekdays. Four weeks is enough mathematically to compute a mean but too few to drop outliers without losing signal; 12 is the smallest sample where the trimmed-mean (drop top + bottom) still has 10 observations. Until then, the forecast card shows: "Forecast available after 12 weeks of bookings on this weekday — check back DD MMM."

The no-show heat map requires ≥ 30 days of operation. Until then: "Heat map appears after 30 days of bookings."

### 7.2 Pro dashboards (additional)

7. **No-show heat map**: 7×24 grid (Mon–Sun × 0–23h), colour-scaled by no-show rate. Reads `reservation_hourly_aggregates`.
8. **Cohort retention**: triangle table (cohort_month × month_offset). Reads `diner_cohort_aggregates`.
9. **Lead-time distribution**: histogram of lead times for last 90 days (5 buckets: <2h / 2–24h / 1–7d / 1–4w / >4w).
10. **Channel attribution**: stacked area chart of `source_*` columns over time.
11. **Cover forecast**: bar chart for next 28 days with confidence band + already-booked overlay.

Pro dashboards are conditionally rendered using the canonical tier-read helper from §12 §3.5: `const sub = await loadActiveSubscription(orgId); if (sub?.tier === 'pro' && sub.status === 'active') { … }`. Base orgs see a "Upgrade to Pro for advanced analytics" CTA in those slots.

### 7.3 Org rollup view (Pro multi-location)

Route: `/partner/org/[orgId]/analytics`.

Same charts as restaurant view, but aggregated across all restaurants in the org. Each chart has a "split by venue" toggle that re-renders with per-restaurant lines.

**Aggregate strategy:** the org rollup runs the same queries against `reservation_daily_aggregates` and `diner_cohort_aggregates` with a `where restaurant_id in (select id from restaurants where organization_id = $org_id)` filter, then aggregates in-query with `sum()` (for counts/covers) or `union all` (for cohorts) over the per-restaurant rows. Lead-time percentiles are recomputed from the source `reservations` for org views — percentile-of-percentiles is statistically wrong; we eat the scan cost (small per request for ≤10 venues).

For chains with **>10 venues**, the per-request sum becomes the dominant cost. A separate `organization_aggregate` table (one row per `(org_id, business_date, service_label)`, computed nightly by extending the `analytics.refresh-aggregates` job) is the v1.5 optimisation. v1 ships the per-venue sum approach; the threshold to add the org-aggregate table is the first measured chain >10 venues asking for org analytics.

### 7.4 Export modal

From the export button: choose date range, choose venues (org rollup view), choose includes (diners / reviews / campaigns). Submit → queues `analytics.run-export` job. Page shows "Your export is being prepared; we'll email a download link when it's ready (~5 min)."

## 8. CSV export

### 8.1 Job: `analytics.run-export`

Per `restaurant_export_jobs`:

1. Set status to `'running'`.
2. Stream-write a ZIP to a temp file. Iterate `restaurant_export_jobs.tables` — for each entry in `{ 'reservations', 'diners', 'reviews', 'campaigns' }`, produce one CSV inside the ZIP. No per-table conditional logic lives in the job itself; it's a generic table-export loop.
3. Each CSV is generated via a streaming query (don't load all rows into memory).
4. Upload the ZIP to the `exports` bucket: `org/<org_id>/<job_id>.zip`.
5. Generate a 24h signed URL.
6. Update `restaurant_export_jobs.status = 'ready'`, `storage_path`, `signed_url_expires_at = now() + interval '24 hours'`, `row_count`, `size_bytes`.
7. **Audit-log the PII access.** Every export that includes diner-identifying columns (`guest_name`, `guest_phone`, `guest_email` in `reservations.csv`; equivalent columns in `diners.csv`) writes one `AUDIT.diner.pii_accessed` row per foundations §16.2 + §03 §5.5 — keyed on the export job rather than per-diner (the volume would be huge). Context: `{ access_kind: 'export', job_id, row_count, tables, date_from, date_to }`. Bypass-tier exports (cancellation, GDPR DSAR, admin) additionally write `AUDIT.analytics.export_run` capturing the `bypass_tier_limit_reason` per §8.3.
8. Send `ExportReadyEmail` to the requester (template registered in §04 §4 templates table).
9. Schedule cleanup job at expiry to delete the file + set `status = 'expired'`.

**Permission boundary:** the action that creates the `restaurant_export_jobs` row is the gate. It calls `requireCan(session, 'analytics.export', org)` for the baseline; if `'campaigns'` is requested in `tables`, it additionally calls `requireCan(session, 'campaigns.read', org)` (foundations §3.4). The export job itself trusts the row: if `tables` contains `'campaigns'`, it exports campaigns without re-checking. This isolates the permission decision in one place and keeps the job free of cross-domain knowledge.

### 8.2 CSV schema

`reservations.csv` columns: id, restaurant_name, business_date, reservation_time, party_size, status, guest_name, guest_phone, guest_email (or masked per export option), notes, zone, booking_type, cancelled_reason, created_at, modified_at, source.

Same flat-file pattern for `diners.csv`, `reviews.csv`. Headers in English; values raw.

### 8.3 The contractual data-export promise

The §13 doc owns the "GDPR full export on cancellation" orchestration. When an org cancels their subscription, §12 triggers a final export with everything. That uses this same `analytics.run-export` job under the hood, called with an explicit override parameter:

```ts
runExport({
  ...,
  bypass_tier_limit_reason: 'subscription_cancellation' | 'gdpr_data_subject_request' | 'tavli_admin_override',
})
```

The parameter is internal-only — accepted only when the caller is one of: §12's `cancelSubscription` action, §13's `compliance.full-org-export` job, or a Tavli-admin action. Regular users cannot pass it. The export job writes an `AUDIT.analytics.export_run` row (foundations §16.2) capturing: `actor_user_id`, `actor_ip`, `org_id`, `restaurant_ids[]` (the export scope), `bypass_tier_limit_reason`, `tables[]` requested, `date_from`, `date_to`, and the resulting `restaurant_export_jobs.id`. Regular (non-bypass) exports also write `AUDIT.analytics.export_run` per step 7 above; the bypass case is distinguished by the `bypass_tier_limit_reason` field being non-null. Foundations §15a.1 erasure-log style: never let a bypass happen without a clear audit trail of who-what-when.

## 9. Weekly summary email

### 9.1 Trigger

pg-boss recurring job: `analytics.weekly-summary` runs every Sunday at 20:00 in each restaurant's timezone.

### 9.2 Content

Email template `WeeklySummaryEmail` (in `src/emails/`, registered in §04):

- Subject: "Tavli — your week at {restaurant_name}"
- Last week's bookings + covers + completed + no-shows + cancellations.
- Week-over-week deltas (with up/down arrows).
- Top 3 dishes ordered (when §08 lands and seating-time tracking enables this; until then, skip).
- Reviews received this week (count + average rating, link to detail).
- Pro: top traffic source this week.
- Pro: next week's forecast — total covers expected.
- Reminders: any reviews without an owner response > 7 days old.

### 9.3 Audience

Sent to every `organization_members` with role in (`owner`, `admin`, `manager`) for the venue's org. Honours their personal locale + their org's restaurant locale fallback.

## 10. Background jobs

| Job | Schedule | Purpose |
|---|---|---|
| `analytics.refresh-aggregates` | nightly 02:00 restaurant-local, per restaurant | Refresh daily / hourly / cohort / forecast aggregates. |
| `analytics.run-export` | on-demand | Generate CSV ZIP, upload, email signed URL. |
| `analytics.expire-stale-exports` | nightly 04:00 UTC | Delete files past `signed_url_expires_at`. |
| `analytics.weekly-summary` | Sundays 20:00 restaurant-local | Send weekly digest email. |
| `analytics.purge-stale-hourly-windows` | weekly | Drop `reservation_hourly_aggregates` rows where `window_end_date < now() - 90 days`. |

## 11. Tier enforcement

- Base orgs: dashboard queries add the venue-local 12-month filter per §3.3: `where business_date >= ((now() at time zone restaurant.timezone)::date - interval '12 months')`. Never use a bare UTC `now()` here — see §3.3 for the rationale.
- Pro orgs: no date filter (full retention).
- Export job for Base: same 12-month filter unless the org is in the cancellation-data-export flow (§13) — that bypasses the tier limit because data-portability is a contractual promise that supersedes tier scoping.
- Pro-only dashboards (heat map, cohort, lead-time, channel, forecast): rendered conditionally based on `loadActiveSubscription(orgId)` (§12 §3.5) returning `tier === 'pro' && status === 'active'`. Backend queries also gate by the same check — don't trust the UI.

### 11.1 Subscription-state race (Pro gating)

A subscription can transition from `active` → `cancelled` mid-request. Without care, a long-running dashboard render started under "active" could expose Pro charts after cancellation, or vice versa. Resolution:

1. **Single read per request, with row lock.** At the top of any Pro-gated server action or RSC, call `loadActiveSubscription(orgId)` inside a transaction with `SELECT ... FOR SHARE` on the subscription row. The lock is held for the duration of the dashboard render. A concurrent cancellation either (a) commits before this read — the request sees `cancelled` immediately, or (b) waits behind the `FOR SHARE` lock and is applied for *the next* request. Race window: zero. **Lock-hold bound:** the dashboard render should complete in well under 5 seconds; if it doesn't, the long-held lock blocks billing-state changes. Pro dashboards that approach this bound move the heavy aggregation work to a job + signed cache key, so the per-request transaction stays tight.
2. **Cancellation re-check on next render.** A cached subscription check carries a `subscription_invalidated_at` timestamp; the helper forces a re-fetch if older than 60 seconds. Operators can shorten this window per-restaurant if their billing operations team needs faster propagation.
3. **No downgrade-mid-stream.** A request that began under Pro continues rendering Pro charts even if cancellation lands during render — the page reload after the next click will reflect the new state. We do not abort in-flight requests on subscription change; the UX cost (sudden empty cards mid-scroll) is worse than the 1-screen-of-data leak.

`loadActiveSubscription` is defined in §12 §3.5; the `FOR SHARE` lock is added there to make the contract enforceable from this surface.

## 12. Build sequence

1. **`reservation_daily_aggregates` table + index + RLS.** *(0.5 day)*
2. **`reservation_hourly_aggregates` table + RLS.** *(0.3 day)*
3. **`diner_cohort_aggregates` table + RLS.** *(0.3 day)*
4. **`restaurant_forecasts` table + RLS.** *(0.3 day)*
5. **`restaurant_export_jobs` table + `exports` bucket.** *(0.5 day)*
6. **`analytics.refresh-aggregates` job** — covers daily + hourly + cohort + forecast computations. Backfill script alongside. *(3 days)*
7. **Base analytics dashboard UI** — Overview + Covers + No-show + Party size + Cancellation reason charts. *(2.5 days)*
8. **Export modal + `analytics.run-export` job + ZIP-streaming + `ExportReadyEmail` template wire (template per §04)**. *(2 days)*
9. **`analytics.weekly-summary` job** + `WeeklySummaryEmail` template (in §04). *(1.5 days)*
10. **Pro dashboard UI** — heat map + cohort + lead-time + channel attribution + forecast. *(3.5 days)*
11. **Org rollup analytics view** — composes existing per-restaurant queries with `group by`. *(1 day)*
12. **Tier enforcement** in dashboard queries + export job. *(0.5 day)*
13. **`analytics.expire-stale-exports` + `analytics.purge-stale-hourly-windows` cleanup jobs.** *(0.3 day)*

**Total: ~16 working days.** The aggregation job (step 6) and the Pro dashboard UI (step 10) are the heaviest.

**Split by launch milestone (per the W8 vs W12 commitment at the top of this doc):**
- **W8 (Base only):** steps 1, 5 (only `reservation_daily_aggregates`-relevant parts), 6 (daily aggregates path only), 7, 8, 9, 12, 13 → ~11 working days.
- **W12 (Pro dashboards):** steps 2, 3, 4, 6 (hourly + cohort + forecast paths), 10, 11 → ~5 additional working days on top of W8 work.
- The split lets the W8 sprint ship without blocking on Pro dashboard polish; nothing in W12 invalidates W8 deliverables.

## 13. Open questions

1. **Should aggregates refresh on every reservation change in addition to nightly?** Recommendation: no. Nightly is fine for everything except today (which uses real-time queries). Triggered refresh on mutation adds DB write contention without UX benefit.

2. **Chart library**: Recharts vs Visx vs hand-rolled SVG? Recommendation: Recharts. React-native, declarative, sufficient for these charts, ~50KB gzipped (measured against the existing Next.js bundle; the partner-portal `/analytics` route is dynamic, so this cost stays out of the public/venue-page bundle entirely). Visx is more flexible but heavier (~120KB). Hand-rolled SVG is too much for the 11 charts here.

3. **Should the heat map smooth across adjacent cells?** Recommendation: not in v1. Raw cell values are interpretable; smoothing hides outliers a restaurant should care about.

4. **Forecast accuracy expectations**: should we show a confidence number? Recommendation: yes — "± X covers" in the bar tooltip. The 1.5×IQR band gives a defensible range without overclaiming precision.

5. **Should weekly summary include a YoY comparison?** Recommendation: only when the venue has ≥ 1 year of data. Otherwise omit. Don't show "no comparison available" — feels apologetic.

6. **Custom date ranges in dashboards**: recommend default views (this week, last 30 days, last 90 days, last 12 months for Pro) with a date-range picker for power users. v1.5 if not feasible at launch.

7. **Should the export include personally-identifiable diner data by default or require explicit opt-in?** Recommendation: include by default for org admins (they have lawful basis); ask for explicit checkbox-confirmation in the export modal for any Tavli-admin-initiated export. Audit log the export reason.

8. **Per-staff dashboard access?** Recommendation: tier the dashboard reads to the `analytics.read` permission per the §01 matrix. Hosts don't see analytics; managers do. Org-rollup views require org-level role.

9. **Should the forecast learn from the restaurant's recent performance trend?** I.e., if the last 4 weeks are trending up 10% week-over-week, should the forecast extrapolate? Recommendation: not in v1. Simple model. v1.5 if restaurants complain it underpredicts growth.

10. **Real-time updates** (websockets to push new bookings to the dashboard)? Recommendation: not in v1. Refresh-on-focus is fine for "today" views. Supabase Realtime exists if we need to add it later (it's already part of the Supabase bundle).

## 14. Cross-references

- **§00 Foundations** — pg-boss, Supabase Storage, structured logs from analytics jobs, `next-intl` for chart labels.
- **§01 Identity & accounts** — `can('analytics.read'|'analytics.export', ...)` gates.
- **§02 Bookings** — primary data source.
- **§03 Diner database** — `diners.acquisition_source` powers channel attribution; `diners.first_visited_at` powers cohort retention.
- **§04 Diner communication** — `WeeklySummaryEmail` + `ExportReadyEmail` templates.
- **§06 Reviews** — review counts + ratings rolled into weekly summary.
- **§09 Multi-location** — org rollup dashboards.
- **§11 Marketing suite** — campaign-specific analytics owned there, but channel attribution aggregates here.
- **§12 Billing & subscriptions** — tier enforcement calls `loadActiveSubscription(orgId)` from §12 §3.5.
- **§13 Compliance & legal** — final export on cancellation runs `analytics.run-export` with bypass-tier-limit flag.

---

*Last updated: 2026-05-20.*
