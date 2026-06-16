/**
 * Pure recurrence logic for standing reservations. No Date.now() — callers pass
 * the [fromDate, throughDate] window. Dates are ISO yyyy-mm-dd strings handled
 * in UTC to avoid timezone drift.
 */

export interface StandingRule {
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday (JS getUTCDay)
  intervalWeeks: 1 | 2;
  startDate: string; // ISO yyyy-mm-dd (series start)
  endDate: string | null; // ISO or null (open-ended)
}

const DAY_MS = 86_400_000;

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}
function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The first occurrence on-or-after startDate that falls on dayOfWeek, then every
 * `intervalWeeks` weeks, intersected with [startDate, endDate] and the window.
 */
export function generateOccurrenceDates(
  rule: StandingRule,
  range: { fromDate: string; throughDate: string },
): string[] {
  const start = toUtc(rule.startDate);
  const startDow = new Date(start).getUTCDay();
  const delta = (rule.dayOfWeek - startDow + 7) % 7;
  const anchor = start + delta * DAY_MS;
  const stepMs = rule.intervalWeeks * 7 * DAY_MS;

  const lo = Math.max(toUtc(range.fromDate), anchor);
  const hiCandidates = [toUtc(range.throughDate)];
  if (rule.endDate) hiCandidates.push(toUtc(rule.endDate));
  const hi = Math.min(...hiCandidates);

  const out: string[] = [];
  if (hi < anchor) return out;
  const stepsFromAnchor = Math.ceil((lo - anchor) / stepMs);
  let cur = anchor + Math.max(0, stepsFromAnchor) * stepMs;
  for (; cur <= hi; cur += stepMs) out.push(toIso(cur));
  return out;
}

/** Expected occurrence dates that have no corresponding reservation row. */
export function deriveConflictDates(expected: string[], existingDates: string[]): string[] {
  const have = new Set(existingDates);
  return expected.filter((d) => !have.has(d));
}
