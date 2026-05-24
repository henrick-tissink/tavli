/**
 * §11 §8 — segment filter DSL → SQL predicate over `diners`. Returns the WHERE
 * fragment only; the caller adds the org scope + `redacted_at IS NULL`.
 *
 * v1 supports 5 of the 6 documented dimensions — recency, frequency, party_size,
 * occasion, channel. "Service preference" has no clean diner column (only the
 * `seating_preferences` jsonb blob) → deferred to v1.5.
 */
import { sql, type SQL } from "drizzle-orm";

export type SegmentCondition =
  | { dimension: "recency"; withinDays?: number; notWithinDays?: number }
  | { dimension: "frequency"; bucket: string }
  | { dimension: "party_size"; min?: number; max?: number }
  | { dimension: "occasion"; tag: string }
  | { dimension: "channel"; source: string };

export type Combinator = "and" | "or";

const KNOWN = new Set(["recency", "frequency", "party_size", "occasion", "channel"]);

function conditionClause(c: SegmentCondition): SQL {
  switch (c.dimension) {
    case "recency":
      if (c.notWithinDays != null) {
        return sql`(d.last_visited_at IS NULL OR d.last_visited_at < now() - (${`${c.notWithinDays} days`}::interval))`;
      }
      return sql`d.last_visited_at >= now() - (${`${c.withinDays ?? 0} days`}::interval)`;
    case "frequency":
      return sql`d.frequency_bucket = ${c.bucket}`;
    case "party_size": {
      const parts: SQL[] = [];
      if (c.min != null) parts.push(sql`d.typical_party_size_max >= ${c.min}`);
      if (c.max != null) parts.push(sql`d.typical_party_size_min <= ${c.max}`);
      return parts.length ? sql`(${sql.join(parts, sql` AND `)})` : sql`true`;
    }
    case "occasion":
      return sql`${c.tag} = ANY(d.occasion_tags)`;
    case "channel":
      return sql`d.acquisition_source = ${c.source}`;
  }
}

export function compileSegmentFilter(
  conditions: SegmentCondition[],
  combinator: Combinator,
  opts: { negate?: boolean } = {},
): SQL {
  if (conditions.length === 0) throw new Error("TV900 segment_empty: a segment needs at least one condition");
  for (const c of conditions) {
    if (!KNOWN.has(c.dimension)) throw new Error(`TV900 segment_unknown_dimension: ${(c as { dimension: string }).dimension}`);
  }
  const joiner = combinator === "or" ? sql` OR ` : sql` AND `;
  const combined = sql`(${sql.join(conditions.map(conditionClause), joiner)})`;
  return opts.negate ? sql`NOT ${combined}` : combined;
}
