/**
 * §07 §5.1 — `analytics.refresh-aggregates` nightly job.
 *
 * Per restaurant (loops all non-archived venues, or one when `restaurantId`
 * is given), recomputes yesterday's venue-local aggregates:
 *   1. daily upsert into reservation_daily_aggregates (set-based SQL — the
 *      service-label / cancel-reason / source-fold logic lives in SQL for the
 *      100× speedup; the JS mirrors in service-label.ts / cancel-reason.ts /
 *      source-fold.ts power the dashboard's real-time "today" delta);
 *   2. lead-time percentiles for the same day;
 *   3. hourly no-show window (Pro heat map);
 *   4. 28-day cover forecast (Pro) via the trimmed-mean core.
 *
 * Idempotent: every write is an upsert keyed on the natural PK.
 *
 * Cohorts are org-scoped and refreshed by a separate pass — see
 * refresh-cohorts.ts.
 */
import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { trimmedMeanForecast } from "@/lib/analytics/forecast";

interface Deps {
  db: typeof dbAdmin;
  now?: () => Date;
}

export interface RefreshAggregatesPayload {
  restaurantId?: string;
}

/**
 * Venue-local "yesterday" as a YYYY-MM-DD string. The day boundary follows the
 * restaurant's timezone, NOT UTC — a venue east of UTC would otherwise see its
 * date roll over up to 23h early (§3.3).
 */
export function computeBusinessDate(timezone: string, now: Date): string {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // "YYYY-MM-DD" — the venue-local *today*
  const [y, m, d] = local.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d));
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev.toISOString().slice(0, 10);
}

export function makeRefreshAggregates(deps: Deps) {
  const now = deps.now ?? (() => new Date());

  return async function refreshAggregates(payload: RefreshAggregatesPayload = {}): Promise<void> {
    const restaurants = (await deps.db.execute(sql`
      SELECT id, timezone FROM restaurants
      WHERE archived_at IS NULL
        ${payload.restaurantId ? sql`AND id = ${payload.restaurantId}` : sql``}
    `)) as unknown as Array<{ id: string; timezone: string }>;

    for (const r of restaurants) {
      const businessDate = computeBusinessDate(r.timezone, now());
      await refreshRestaurantDay(deps.db, r.id, businessDate, r.timezone);
      await refreshForecast(deps.db, r.id, businessDate);
    }
  };
}

export const refreshAggregates = makeRefreshAggregates({ db: dbAdmin });

/**
 * Recompute one venue-local day's daily + lead-time + hourly aggregates.
 * Shared by the nightly job and the backfill job (forecast runs once per
 * restaurant, not per backfilled day, so it stays out of this helper).
 */
export async function refreshRestaurantDay(
  db: typeof dbAdmin,
  restaurantId: string,
  businessDate: string,
  timezone: string,
): Promise<void> {
  await upsertDaily(db, restaurantId, businessDate);
  await updateLeadTime(db, restaurantId, businessDate, timezone);
  await upsertHourly(db, restaurantId, businessDate);
}

// ── daily upsert ──────────────────────────────────────────────────────────
async function upsertDaily(db: typeof dbAdmin, restaurantId: string, businessDate: string) {
  await db.execute(sql`
    INSERT INTO reservation_daily_aggregates (
      restaurant_id, business_date, service_label,
      bookings_created, bookings_for_date,
      confirmed_count, seated_count, completed_count, no_show_count, cancelled_count,
      covers_for_date, covers_completed, covers_no_show,
      party_size_1_2, party_size_3_4, party_size_5_6, party_size_7_plus,
      cancel_reason_restaurant_closed, cancel_reason_overbooked, cancel_reason_kitchen_issue,
      cancel_reason_private_event, cancel_reason_other, cancel_reason_diner,
      booking_type_standard, booking_type_private_event, booking_type_standing,
      source_widget, source_venue_page, source_editorial, source_corporate,
      source_walk_in, source_manual, source_unknown,
      new_diners, returning_diners, computed_at
    )
    SELECT
      r.restaurant_id,
      r.reservation_date,
      analytics_service_label_for_hour(r.reservation_time) AS service_label,
      count(*) FILTER (WHERE r.created_at::date = ${businessDate}::date),
      count(*),
      count(*) FILTER (WHERE r.status = 'confirmed'),
      count(*) FILTER (WHERE r.status = 'seated'),
      count(*) FILTER (WHERE r.status = 'completed'),
      count(*) FILTER (WHERE r.status = 'no_show'),
      count(*) FILTER (WHERE r.status = 'cancelled'),
      coalesce(sum(r.party_size), 0),
      coalesce(sum(r.party_size) FILTER (WHERE r.status = 'completed'), 0),
      coalesce(sum(r.party_size) FILTER (WHERE r.status = 'no_show'), 0),
      count(*) FILTER (WHERE r.party_size BETWEEN 1 AND 2),
      count(*) FILTER (WHERE r.party_size BETWEEN 3 AND 4),
      count(*) FILTER (WHERE r.party_size BETWEEN 5 AND 6),
      count(*) FILTER (WHERE r.party_size >= 7),
      count(*) FILTER (WHERE r.status = 'cancelled' AND r.cancelled_reason = 'restaurant_closed'),
      count(*) FILTER (WHERE r.status = 'cancelled' AND r.cancelled_reason = 'overbooked'),
      count(*) FILTER (WHERE r.status = 'cancelled' AND r.cancelled_reason = 'kitchen_issue'),
      count(*) FILTER (WHERE r.status = 'cancelled' AND r.cancelled_reason = 'private_event'),
      count(*) FILTER (WHERE r.status = 'cancelled' AND r.cancelled_reason IS NOT NULL
        AND r.cancelled_reason NOT IN ('restaurant_closed','overbooked','kitchen_issue','private_event')),
      count(*) FILTER (WHERE r.status = 'cancelled' AND r.cancelled_reason IS NULL),
      count(*) FILTER (WHERE r.booking_type = 'standard'),
      count(*) FILTER (WHERE r.booking_type = 'private_event'),
      count(*) FILTER (WHERE r.booking_type = 'standing'),
      count(*) FILTER (WHERE d.acquisition_source = 'widget'),
      count(*) FILTER (WHERE d.acquisition_source = 'venue_page'),
      count(*) FILTER (WHERE d.acquisition_source = 'editorial'),
      count(*) FILTER (WHERE d.acquisition_source = 'corporate'),
      count(*) FILTER (WHERE d.acquisition_source = 'walk_in'),
      count(*) FILTER (WHERE d.acquisition_source IN ('manual','import','api')),
      count(*) FILTER (WHERE r.diner_id IS NULL OR d.acquisition_source IS NULL
        OR d.acquisition_source = 'email_campaign'),
      count(DISTINCT d.id) FILTER (WHERE (d.first_visited_at AT TIME ZONE rest.timezone)::date = r.reservation_date),
      count(DISTINCT d.id) FILTER (WHERE (d.first_visited_at AT TIME ZONE rest.timezone)::date < r.reservation_date),
      now()
    FROM reservations r
    JOIN restaurants rest ON rest.id = r.restaurant_id
    LEFT JOIN diners d ON d.id = r.diner_id
    WHERE r.restaurant_id = ${restaurantId}
      AND r.reservation_date = ${businessDate}::date
    GROUP BY r.restaurant_id, r.reservation_date, analytics_service_label_for_hour(r.reservation_time)
    ON CONFLICT (restaurant_id, business_date, service_label) DO UPDATE SET
      bookings_created = excluded.bookings_created,
      bookings_for_date = excluded.bookings_for_date,
      confirmed_count = excluded.confirmed_count,
      seated_count = excluded.seated_count,
      completed_count = excluded.completed_count,
      no_show_count = excluded.no_show_count,
      cancelled_count = excluded.cancelled_count,
      covers_for_date = excluded.covers_for_date,
      covers_completed = excluded.covers_completed,
      covers_no_show = excluded.covers_no_show,
      party_size_1_2 = excluded.party_size_1_2,
      party_size_3_4 = excluded.party_size_3_4,
      party_size_5_6 = excluded.party_size_5_6,
      party_size_7_plus = excluded.party_size_7_plus,
      cancel_reason_restaurant_closed = excluded.cancel_reason_restaurant_closed,
      cancel_reason_overbooked = excluded.cancel_reason_overbooked,
      cancel_reason_kitchen_issue = excluded.cancel_reason_kitchen_issue,
      cancel_reason_private_event = excluded.cancel_reason_private_event,
      cancel_reason_other = excluded.cancel_reason_other,
      cancel_reason_diner = excluded.cancel_reason_diner,
      booking_type_standard = excluded.booking_type_standard,
      booking_type_private_event = excluded.booking_type_private_event,
      booking_type_standing = excluded.booking_type_standing,
      source_widget = excluded.source_widget,
      source_venue_page = excluded.source_venue_page,
      source_editorial = excluded.source_editorial,
      source_corporate = excluded.source_corporate,
      source_walk_in = excluded.source_walk_in,
      source_manual = excluded.source_manual,
      source_unknown = excluded.source_unknown,
      new_diners = excluded.new_diners,
      returning_diners = excluded.returning_diners,
      computed_at = now()
  `);
}

// ── lead-time percentiles ───────────────────────────────────────────────────
// reservation_date + reservation_time is a local wall-clock; AT TIME ZONE the
// venue tz turns it into a timestamptz so it can be subtracted from the
// timestamptz created_at without a silent offset.
async function updateLeadTime(db: typeof dbAdmin, restaurantId: string, businessDate: string, timezone: string) {
  await db.execute(sql`
    WITH lt AS (
      SELECT
        analytics_service_label_for_hour(r.reservation_time) AS service_label,
        extract(epoch FROM (
          ((r.reservation_date + r.reservation_time) AT TIME ZONE ${timezone}) - r.created_at
        )) / 60.0 AS minutes
      FROM reservations r
      WHERE r.restaurant_id = ${restaurantId}
        AND r.reservation_date = ${businessDate}::date
        AND r.status <> 'cancelled'
    )
    UPDATE reservation_daily_aggregates a SET
      lead_time_p50_min = sub.p50,
      lead_time_p90_min = sub.p90,
      lead_time_avg_min = sub.avg
    FROM (
      SELECT service_label,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes))::int AS p50,
        round(percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes))::int AS p90,
        round(avg(minutes))::int AS avg
      FROM lt GROUP BY service_label
    ) sub
    WHERE a.restaurant_id = ${restaurantId}
      AND a.business_date = ${businessDate}::date
      AND a.service_label = sub.service_label
  `);
}

// ── hourly no-show window (90-day rolling) ──────────────────────────────────
async function upsertHourly(db: typeof dbAdmin, restaurantId: string, businessDate: string) {
  await db.execute(sql`
    INSERT INTO reservation_hourly_aggregates (
      restaurant_id, day_of_week, hour_of_day, window_start_date, window_end_date,
      total_bookings, no_show_count, no_show_rate, computed_at
    )
    SELECT
      r.restaurant_id,
      extract(dow FROM r.reservation_date)::smallint,
      extract(hour FROM r.reservation_time)::smallint,
      (${businessDate}::date - interval '90 days')::date,
      ${businessDate}::date,
      count(*),
      count(*) FILTER (WHERE r.status = 'no_show'),
      (count(*) FILTER (WHERE r.status = 'no_show'))::numeric / nullif(count(*), 0),
      now()
    FROM reservations r
    WHERE r.restaurant_id = ${restaurantId}
      AND r.reservation_date > (${businessDate}::date - interval '90 days')
      AND r.reservation_date <= ${businessDate}::date
    GROUP BY r.restaurant_id, extract(dow FROM r.reservation_date), extract(hour FROM r.reservation_time)
    ON CONFLICT (restaurant_id, day_of_week, hour_of_day, window_end_date) DO UPDATE SET
      window_start_date = excluded.window_start_date,
      total_bookings = excluded.total_bookings,
      no_show_count = excluded.no_show_count,
      no_show_rate = excluded.no_show_rate,
      computed_at = now()
  `);
}

// ── 28-day cover forecast (Pro) ─────────────────────────────────────────────
export async function refreshForecast(db: typeof dbAdmin, restaurantId: string, businessDate: string) {
  // Pull recent per-day covers (summed across service labels) and bucket by
  // weekday in JS; the trimmed-mean estimator needs the raw observations.
  const history = (await db.execute(sql`
    SELECT business_date::text AS business_date, sum(covers_for_date)::int AS covers
    FROM reservation_daily_aggregates
    WHERE restaurant_id = ${restaurantId}
      AND business_date <= ${businessDate}::date
    GROUP BY business_date
    ORDER BY business_date DESC
    LIMIT 200
  `)) as unknown as Array<{ business_date: string; covers: number }>;

  if (history.length === 0) return;

  // weekday (0=Sun) → covers, most-recent first.
  const byWeekday = new Map<number, number[]>();
  for (const row of history) {
    const wd = new Date(`${row.business_date}T00:00:00Z`).getUTCDay();
    const list = byWeekday.get(wd) ?? [];
    list.push(row.covers);
    byWeekday.set(wd, list);
  }

  const base = new Date(`${businessDate}T00:00:00Z`);
  const values: SQL[] = [];
  for (let i = 1; i <= 28; i++) {
    const future = new Date(base);
    future.setUTCDate(base.getUTCDate() + i);
    const wd = future.getUTCDay();
    const obs = (byWeekday.get(wd) ?? []).slice(0, 12);
    const f = trimmedMeanForecast(obs);
    if (!f) continue;
    const dateStr = future.toISOString().slice(0, 10);
    values.push(sql`(${restaurantId}, ${dateStr}::date, ${f.predicted}, ${f.low}, ${f.high}, now())`);
  }

  if (values.length === 0) return;

  await db.execute(sql`
    INSERT INTO restaurant_forecasts (
      restaurant_id, forecast_date, covers_predicted, covers_low, covers_high, computed_at
    ) VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (restaurant_id, forecast_date) DO UPDATE SET
      covers_predicted = excluded.covers_predicted,
      covers_low = excluded.covers_low,
      covers_high = excluded.covers_high,
      computed_at = now()
  `);
}
