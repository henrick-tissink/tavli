/**
 * §07 §5.1b — `analytics.refresh-cohorts` nightly job (org-scoped).
 *
 * For each organization, recompute diner-retention cohorts from actual visits
 * (status seated/completed). reservation_date is already a venue-local calendar
 * date, so the cohort/visit month is just date_trunc('month', reservation_date)
 * — no timezone math needed.
 *
 * Past-month immutability (§5.1b) is enforced by the ON CONFLICT guard: only
 * rows whose cohort_month is the current calendar month are updated; closed
 * months are written once and then frozen (the accepted O(N)-per-night
 * trade-off). New offset rows always insert.
 */
import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { computeCohortRows, type DinerVisits } from "@/lib/analytics/cohort";

interface Deps {
  db: typeof dbAdmin;
  now?: () => Date;
}

export interface RefreshCohortsPayload {
  organizationId?: string;
}

function currentMonth(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function makeRefreshCohorts(deps: Deps) {
  const now = deps.now ?? (() => new Date());

  return async function refreshCohorts(payload: RefreshCohortsPayload = {}): Promise<void> {
    const orgs = (await deps.db.execute(sql`
      SELECT id FROM organizations
      ${payload.organizationId ? sql`WHERE id = ${payload.organizationId}` : sql``}
    `)) as unknown as Array<{ id: string }>;

    const throughMonth = currentMonth(now());

    for (const org of orgs) {
      const visitRows = (await deps.db.execute(sql`
        SELECT d.id AS diner_id,
               to_char(date_trunc('month', r.reservation_date), 'YYYY-MM-DD') AS visit_month
        FROM reservations r
        JOIN diners d ON d.id = r.diner_id
        WHERE d.organization_id = ${org.id}
          AND r.status IN ('seated', 'completed')
        GROUP BY d.id, date_trunc('month', r.reservation_date)
      `)) as unknown as Array<{ diner_id: string; visit_month: string }>;

      if (visitRows.length === 0) continue;

      // Group visit months per diner; cohort month = earliest visit.
      const byDiner = new Map<string, string[]>();
      for (const row of visitRows) {
        const list = byDiner.get(row.diner_id) ?? [];
        list.push(row.visit_month);
        byDiner.set(row.diner_id, list);
      }
      const diners: DinerVisits[] = [...byDiner.values()].map((visitMonths) => ({
        cohortMonth: visitMonths.slice().sort()[0],
        visitMonths,
      }));

      const rows = computeCohortRows(diners, throughMonth);
      if (rows.length === 0) continue;

      const values: SQL[] = rows.map(
        (r) =>
          sql`(${org.id}, ${r.cohortMonth}::date, ${r.monthOffset}, ${r.cohortSize}, ${r.retainedCount}, ${r.retentionRate})`,
      );

      await deps.db.execute(sql`
        INSERT INTO diner_cohort_aggregates (
          organization_id, cohort_month, month_offset, cohort_size, retained_count, retention_rate
        ) VALUES ${sql.join(values, sql`, `)}
        ON CONFLICT (organization_id, cohort_month, month_offset) DO UPDATE SET
          cohort_size = excluded.cohort_size,
          retained_count = excluded.retained_count,
          retention_rate = excluded.retention_rate,
          computed_at = now()
        WHERE excluded.cohort_month >= date_trunc('month', now())::date
      `);
    }
  };
}

export const refreshCohorts = makeRefreshCohorts({ db: dbAdmin });
