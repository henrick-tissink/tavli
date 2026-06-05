/**
 * Partner overview stat-card counts (0062 telemetry + reservations).
 * Service-role reads — the partner dashboard renders server-side for the
 * signed-in owner only. Returns null in mock mode (cards keep their stubs).
 */

import "server-only";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  restaurantViewEvents,
  restaurantSaves,
  reservations,
} from "@/lib/db/schema";

export interface OverviewStats {
  viewsThisWeek: number;
  saves: number;
  upcomingReservations: number;
}

interface Deps {
  db: typeof dbAdmin;
  /** Mirrors the repo layer's mock/db switch; defaults to true for tests. */
  enabled?: () => boolean;
}

export function makeGetOverviewStats(deps: Deps) {
  return async function getOverviewStats(
    restaurantId: string,
  ): Promise<OverviewStats | null> {
    if (!(deps.enabled?.() ?? true)) return null;

    const [[views], [saves], [upcoming]] = await Promise.all([
      deps.db
        .select({ count: count() })
        .from(restaurantViewEvents)
        .where(
          and(
            eq(restaurantViewEvents.restaurantId, restaurantId),
            gte(restaurantViewEvents.occurredAt, sql`now() - interval '7 days'`),
          ),
        ),
      deps.db
        .select({ count: count() })
        .from(restaurantSaves)
        .where(eq(restaurantSaves.restaurantId, restaurantId)),
      deps.db
        .select({ count: count() })
        .from(reservations)
        .where(
          and(
            eq(reservations.restaurantId, restaurantId),
            eq(reservations.status, "confirmed"),
            gte(reservations.reservationDate, sql`current_date`),
          ),
        ),
    ]);

    return {
      viewsThisWeek: views.count,
      saves: saves.count,
      upcomingReservations: upcoming.count,
    };
  };
}

export const getOverviewStats = makeGetOverviewStats({
  db: dbAdmin,
  enabled: () => process.env.NEXT_PUBLIC_USE_DB === "true",
});
