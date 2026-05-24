/**
 * §07 §5.2 — `analytics.backfill-aggregates` one-time (on-demand) job.
 *
 * Loops every (restaurant, day) from the earliest reservation to yesterday and
 * computes the daily/lead-time/hourly aggregates, then one forecast per
 * restaurant. Restartable: resumes from max(business_date)+1 already present in
 * reservation_daily_aggregates, so an interrupted run picks up where it left
 * off. Never scheduled — enqueued manually after the substrate lands (or after
 * a data correction).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  computeBusinessDate,
  refreshRestaurantDay,
  refreshForecast,
} from "@/lib/analytics/refresh-aggregates";

interface Deps {
  db: typeof dbAdmin;
  now?: () => Date;
}

export interface BackfillPayload {
  restaurantId?: string;
}

/** Inclusive list of YYYY-MM-DD strings from `start` to `end`. */
export function enumerateDays(start: string, end: string): string[] {
  const days: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur.getTime() <= last.getTime()) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

function addDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function makeBackfillAggregates(deps: Deps) {
  const now = deps.now ?? (() => new Date());

  return async function backfillAggregates(payload: BackfillPayload = {}): Promise<void> {
    const restaurants = (await deps.db.execute(sql`
      SELECT id, timezone FROM restaurants
      WHERE archived_at IS NULL
        ${payload.restaurantId ? sql`AND id = ${payload.restaurantId}` : sql``}
    `)) as unknown as Array<{ id: string; timezone: string }>;

    for (const r of restaurants) {
      const yesterday = computeBusinessDate(r.timezone, now());

      const earliestRows = (await deps.db.execute(sql`
        SELECT min(reservation_date)::text AS min FROM reservations WHERE restaurant_id = ${r.id}
      `)) as unknown as Array<{ min: string | null }>;
      const earliest = earliestRows[0]?.min;
      if (!earliest) continue; // no reservations yet

      const lastDoneRows = (await deps.db.execute(sql`
        SELECT max(business_date)::text AS max FROM reservation_daily_aggregates WHERE restaurant_id = ${r.id}
      `)) as unknown as Array<{ max: string | null }>;
      const lastDone = lastDoneRows[0]?.max;

      const start = lastDone ? addDay(lastDone) : earliest;

      for (const day of enumerateDays(start, yesterday)) {
        await refreshRestaurantDay(deps.db, r.id, day, r.timezone);
      }
      await refreshForecast(deps.db, r.id, yesterday);
    }
  };
}

export const backfillAggregates = makeBackfillAggregates({ db: dbAdmin });
