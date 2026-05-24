/**
 * §07 §7 — partner-portal analytics read layer. Server-side data functions for
 * the Base + Pro dashboards. Each reads the pre-computed aggregates (and, for
 * "today", the live reservations row). Base orgs get a venue-local 12-month
 * retention floor (§3.3 / §11); Pro orgs see full history.
 *
 * Pure shaping helpers (exported for unit tests) sit alongside the query
 * methods so the chart transforms are verifiable without a DB.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";

// ── pure helpers ────────────────────────────────────────────────────────────

/** Base tier: YYYY-MM-DD twelve months before today. Pro: null (no floor). */
export function dashboardRetentionFloor(tier: "base" | "pro", now: Date): string | null {
  if (tier === "pro") return null;
  const d = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

export interface PartyMixDatum {
  bucket: string;
  count: number;
}

export function toPartyMixSeries(rows: Array<Record<string, number>>): PartyMixDatum[] {
  const sum = (k: string) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
  return [
    { bucket: "1–2", count: sum("party_size_1_2") },
    { bucket: "3–4", count: sum("party_size_3_4") },
    { bucket: "5–6", count: sum("party_size_5_6") },
    { bucket: "7+", count: sum("party_size_7_plus") },
  ];
}

export interface CancellationDatum {
  reason: string;
  count: number;
}

export function toCancellationDonut(row: Record<string, number>): CancellationDatum[] {
  const reasons = [
    "restaurant_closed",
    "overbooked",
    "kitchen_issue",
    "private_event",
    "other",
    "diner",
  ];
  return reasons
    .map((reason) => ({ reason, count: row[`cancel_reason_${reason}`] ?? 0 }))
    .filter((d) => d.count > 0);
}

/** 7 (dow) × 24 (hour) grid of no-show rates; null where there's no data. */
export function buildHeatMapMatrix(
  rows: Array<{ day_of_week: number; hour_of_day: number; no_show_rate: string | number | null }>,
): Array<Array<number | null>> {
  const grid: Array<Array<number | null>> = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => null as number | null),
  );
  for (const r of rows) {
    const rate = r.no_show_rate == null ? null : Number(r.no_show_rate);
    grid[r.day_of_week][r.hour_of_day] = rate;
  }
  return grid;
}

// ── query layer ─────────────────────────────────────────────────────────────

export interface OverviewWeek {
  bookings: number;
  covers: number;
  completed: number;
  noShows: number;
}

interface Deps {
  db: typeof dbAdmin;
  now?: () => Date;
}

export function makeAnalyticsQueries(deps: Deps) {
  const now = deps.now ?? (() => new Date());

  function floorClause(tier: "base" | "pro") {
    const floor = dashboardRetentionFloor(tier, now());
    return floor ? sql`AND business_date >= ${floor}::date` : sql``;
  }

  return {
    /** Covers per service_label over the last `days` days. */
    async coversPerService(restaurantId: string, tier: "base" | "pro", days = 30) {
      return (await deps.db.execute(sql`
        SELECT service_label, coalesce(sum(covers_for_date), 0)::int AS covers
        FROM reservation_daily_aggregates
        WHERE restaurant_id = ${restaurantId}
          AND business_date > (current_date - ${`${days} days`}::interval)
          ${floorClause(tier)}
        GROUP BY service_label
        ORDER BY service_label
      `)) as unknown as Array<{ service_label: string; covers: number }>;
    },

    /** No-show rate trend (daily) over `days`. */
    async noShowTrend(restaurantId: string, tier: "base" | "pro", days = 90) {
      return (await deps.db.execute(sql`
        SELECT business_date::text AS date,
          coalesce(sum(no_show_count), 0)::int AS no_shows,
          coalesce(sum(bookings_for_date), 0)::int AS bookings
        FROM reservation_daily_aggregates
        WHERE restaurant_id = ${restaurantId}
          AND business_date > (current_date - ${`${days} days`}::interval)
          ${floorClause(tier)}
        GROUP BY business_date ORDER BY business_date
      `)) as unknown as Array<{ date: string; no_shows: number; bookings: number }>;
    },

    /** Raw party-size bucket rows for `days` (shape via toPartyMixSeries). */
    async partyMixRows(restaurantId: string, tier: "base" | "pro", days = 90) {
      return (await deps.db.execute(sql`
        SELECT party_size_1_2, party_size_3_4, party_size_5_6, party_size_7_plus
        FROM reservation_daily_aggregates
        WHERE restaurant_id = ${restaurantId}
          AND business_date > (current_date - ${`${days} days`}::interval)
          ${floorClause(tier)}
      `)) as unknown as Array<Record<string, number>>;
    },

    /** Aggregated cancellation-reason row for `days` (shape via toCancellationDonut). */
    async cancellationRow(restaurantId: string, tier: "base" | "pro", days = 90) {
      const rows = (await deps.db.execute(sql`
        SELECT
          coalesce(sum(cancel_reason_restaurant_closed), 0)::int AS cancel_reason_restaurant_closed,
          coalesce(sum(cancel_reason_overbooked), 0)::int AS cancel_reason_overbooked,
          coalesce(sum(cancel_reason_kitchen_issue), 0)::int AS cancel_reason_kitchen_issue,
          coalesce(sum(cancel_reason_private_event), 0)::int AS cancel_reason_private_event,
          coalesce(sum(cancel_reason_other), 0)::int AS cancel_reason_other,
          coalesce(sum(cancel_reason_diner), 0)::int AS cancel_reason_diner
        FROM reservation_daily_aggregates
        WHERE restaurant_id = ${restaurantId}
          AND business_date > (current_date - ${`${days} days`}::interval)
          ${floorClause(tier)}
      `)) as unknown as Array<Record<string, number>>;
      return rows[0] ?? {};
    },

    // ── Pro ──
    /** Latest 90-day no-show window (shape via buildHeatMapMatrix). */
    async heatMapRows(restaurantId: string) {
      return (await deps.db.execute(sql`
        SELECT day_of_week, hour_of_day, no_show_rate
        FROM reservation_hourly_aggregates h
        WHERE restaurant_id = ${restaurantId}
          AND window_end_date = (
            SELECT max(window_end_date) FROM reservation_hourly_aggregates WHERE restaurant_id = ${restaurantId}
          )
      `)) as unknown as Array<{ day_of_week: number; hour_of_day: number; no_show_rate: string | null }>;
    },

    /** Cohort-retention triangle for the org. */
    async cohortRows(organizationId: string) {
      return (await deps.db.execute(sql`
        SELECT cohort_month::text AS cohort_month, month_offset, retention_rate
        FROM diner_cohort_aggregates
        WHERE organization_id = ${organizationId}
        ORDER BY cohort_month, month_offset
      `)) as unknown as Array<{ cohort_month: string; month_offset: number; retention_rate: string | null }>;
    },

    /** Lead-time medians over the window (Pro lead-time distribution input). */
    async leadTimeRows(restaurantId: string, days = 90) {
      return (await deps.db.execute(sql`
        SELECT business_date::text AS date, lead_time_p50_min, lead_time_p90_min
        FROM reservation_daily_aggregates
        WHERE restaurant_id = ${restaurantId}
          AND business_date > (current_date - ${`${days} days`}::interval)
          AND lead_time_p50_min IS NOT NULL
        ORDER BY business_date
      `)) as unknown as Array<{ date: string; lead_time_p50_min: number; lead_time_p90_min: number }>;
    },

    /** Channel attribution (source_* sums) over the window. */
    async channelRows(restaurantId: string, days = 90) {
      const rows = (await deps.db.execute(sql`
        SELECT
          coalesce(sum(source_widget), 0)::int AS widget,
          coalesce(sum(source_venue_page), 0)::int AS venue_page,
          coalesce(sum(source_editorial), 0)::int AS editorial,
          coalesce(sum(source_corporate), 0)::int AS corporate,
          coalesce(sum(source_walk_in), 0)::int AS walk_in,
          coalesce(sum(source_manual), 0)::int AS manual,
          coalesce(sum(source_unknown), 0)::int AS unknown
        FROM reservation_daily_aggregates
        WHERE restaurant_id = ${restaurantId}
          AND business_date > (current_date - ${`${days} days`}::interval)
      `)) as unknown as Array<Record<string, number>>;
      return rows[0] ?? {};
    },

    /** 28-day forecast with confirmed-bookings overlay. */
    async forecastRows(restaurantId: string) {
      return (await deps.db.execute(sql`
        SELECT forecast_date::text AS date, covers_predicted, covers_low, covers_high, bookings_already_confirmed
        FROM restaurant_forecasts
        WHERE restaurant_id = ${restaurantId} AND forecast_date >= current_date
        ORDER BY forecast_date
      `)) as unknown as Array<{
        date: string;
        covers_predicted: number;
        covers_low: number;
        covers_high: number;
        bookings_already_confirmed: number;
      }>;
    },
  };
}

export const analyticsQueries = makeAnalyticsQueries({ db: dbAdmin });
