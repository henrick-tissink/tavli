/**
 * §07 §4.3 / §5.1b — cohort-retention compute (pure).
 *
 * Of the diners whose first visit was in month M, what fraction visited again
 * in M, M+1, …, M+24. Org-scoped (the caller passes one org's diners). The
 * past-month immutability rule (§5.1b) is enforced by the job's ON CONFLICT
 * guard, not here — this transform just produces the candidate rows.
 *
 * Month values are first-of-month ISO date strings ("YYYY-MM-01").
 */
export interface DinerVisits {
  /** First-of-month of the diner's first visit. */
  cohortMonth: string;
  /** Distinct first-of-month strings the diner visited in (includes cohortMonth). */
  visitMonths: string[];
}

export interface CohortRow {
  cohortMonth: string;
  monthOffset: number;
  cohortSize: number;
  retainedCount: number;
  retentionRate: number;
}

const MAX_OFFSET = 24;

/** Add `n` months to a "YYYY-MM-01" string. */
function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

export function computeCohortRows(
  diners: DinerVisits[],
  throughMonth: string,
  maxOffset: number = MAX_OFFSET,
): CohortRow[] {
  // Group diners by cohort month.
  const byCohort = new Map<string, DinerVisits[]>();
  for (const d of diners) {
    const list = byCohort.get(d.cohortMonth) ?? [];
    list.push(d);
    byCohort.set(d.cohortMonth, list);
  }

  const rows: CohortRow[] = [];
  for (const [cohortMonth, members] of byCohort) {
    const cohortSize = members.length;
    for (let offset = 0; offset <= maxOffset; offset++) {
      const target = addMonths(cohortMonth, offset);
      if (target > throughMonth) break; // can't measure future months yet
      const retainedCount = members.filter((d) => d.visitMonths.includes(target)).length;
      rows.push({
        cohortMonth,
        monthOffset: offset,
        cohortSize,
        retainedCount,
        retentionRate: Number((retainedCount / cohortSize).toFixed(4)),
      });
    }
  }
  return rows;
}
