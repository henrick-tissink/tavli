/**
 * §07 §5.1a — service-label heuristic (TypeScript mirror of the SQL function
 * `analytics_service_label_for_hour`). Maps a venue-local reservation time to
 * a service bucket. Windows are inclusive of start, exclusive of end; when
 * multiple windows match, the EARLIER service wins (brunch>lunch at 12:30;
 * dinner>late at 22:00). No match → 'all_day'.
 *
 * Kept in lockstep with the SQL fn in migration 0042 — the aggregate job uses
 * the SQL fn; this mirror exists for unit-testable pure logic + any in-JS use.
 */
export type ServiceLabel = "brunch" | "lunch" | "dinner" | "late" | "all_day";

/** Parse "HH:MM" or "HH:MM:SS" → minutes since midnight. */
function toMinutes(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m);
}

export function serviceLabelForHour(time: string): ServiceLabel {
  const t = toMinutes(time);
  const at = (h: number, m = 0) => h * 60 + m;

  if (t >= at(10) && t < at(13)) return "brunch";
  if (t >= at(11) && t < at(15)) return "lunch";
  if (t >= at(17) && t < at(23)) return "dinner";
  // late wraps midnight: 21:00–23:59 or 00:00–02:00 (exclusive)
  if (t >= at(21) || t < at(2)) return "late";
  return "all_day";
}
