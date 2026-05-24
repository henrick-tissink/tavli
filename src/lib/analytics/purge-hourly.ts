/**
 * §07 §10 — `analytics.purge-stale-hourly-windows` weekly cleanup.
 *
 * The heat map only reads the latest 90-day window per (dow, hour); a new
 * window_end_date is written each night, so old windows accumulate. Drop rows
 * whose window has fully aged out (>90 days behind today).
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";

interface Deps {
  db: typeof dbAdmin;
}

export function makePurgeStaleHourlyWindows(deps: Deps) {
  return async function purgeStaleHourlyWindows(): Promise<void> {
    await deps.db.execute(sql`
      DELETE FROM reservation_hourly_aggregates
      WHERE window_end_date < (now()::date - interval '90 days')
    `);
  };
}

export const purgeStaleHourlyWindows = makePurgeStaleHourlyWindows({ db: dbAdmin });
