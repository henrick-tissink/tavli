/**
 * §07 §4.1 / spec §2.3 — channel-attribution 9→7 fold.
 *
 * `diners.acquisition_source` has 9 enum values (+ null); the daily-aggregate
 * table keeps 7 source columns. This collapses the extra values:
 *   import, api      → manual   (operator/system-entered, not a real channel)
 *   email_campaign   → unknown  (marketing attribution is owned by §11)
 *   null / unrecognised / no linked diner → unknown
 */
export type SourceColumn =
  | "source_widget"
  | "source_venue_page"
  | "source_editorial"
  | "source_corporate"
  | "source_walk_in"
  | "source_manual"
  | "source_unknown";

const MAP: Record<string, SourceColumn> = {
  widget: "source_widget",
  venue_page: "source_venue_page",
  editorial: "source_editorial",
  corporate: "source_corporate",
  walk_in: "source_walk_in",
  manual: "source_manual",
  import: "source_manual",
  api: "source_manual",
  email_campaign: "source_unknown",
};

export function foldAcquisitionSource(src: string | null | undefined): SourceColumn {
  if (!src) return "source_unknown";
  return MAP[src] ?? "source_unknown";
}
