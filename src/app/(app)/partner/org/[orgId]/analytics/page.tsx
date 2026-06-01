/**
 * §07 §7.3 — organization rollup analytics (Pro multi-location). Same charts as
 * the venue view, aggregated across every venue in the org. Gated by
 * `analytics.read` at org scope. Heat-map / lead-time / forecast are per-venue
 * concepts; the org view focuses on the summable charts + org-level cohort
 * retention (the headline multi-location metric). (Per-venue split toggle +
 * org-level heat-map/forecast are a v1.5 refinement.)
 */
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { analyticsQueries, toPartyMixSeries, toCancellationDonut } from "@/lib/analytics/queries";
import { AnalyticsView, type AnalyticsViewData } from "../../../(dashboard)/analytics/_components/AnalyticsView";

export const dynamic = "force-dynamic";

const CANCEL_RO: Record<string, string> = {
  restaurant_closed: "Restaurant închis",
  overbooked: "Suprarezervare",
  kitchen_issue: "Bucătărie",
  private_event: "Eveniment privat",
  other: "Altul",
  diner: "Client",
};
const CHANNEL_RO: Record<string, string> = {
  widget: "Widget",
  venue_page: "Pagină local",
  editorial: "Editorial",
  corporate: "Corporate",
  walk_in: "Walk-in",
  manual: "Manual",
  unknown: "Necunoscut",
};
const SERVICE_RO: Record<string, string> = { brunch: "Brunch", lunch: "Prânz", dinner: "Cină", late: "Târziu", all_day: "Toată ziua" };

export default async function OrgAnalyticsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  if (!(await can(session, "analytics.read", { kind: "organization", id: orgId }))) {
    redirect("/partner");
  }

  const [org] = (await dbAdmin.execute(sql`
    SELECT id, name FROM organizations WHERE id = ${orgId}
  `)) as unknown as Array<{ id: string; name: string }>;
  if (!org) redirect("/partner");

  const sub = await loadActiveSubscription(orgId);
  const tier: "base" | "pro" = sub?.tier === "pro" && sub.status === "active" ? "pro" : "base";

  // Org-summed aggregates across all the org's venues.
  const scope = sql`restaurant_id IN (SELECT id FROM restaurants WHERE organization_id = ${orgId})`;
  const days = (n: number) => sql`business_date > (current_date - ${`${n} days`}::interval)`;

  const [coversRows, noShowRows, partyRows, cancelRows, channelRows, overviewRows, cohortRows] = await Promise.all([
    dbAdmin.execute(sql`SELECT service_label, coalesce(sum(covers_for_date),0)::int AS covers FROM reservation_daily_aggregates WHERE ${scope} AND ${days(30)} GROUP BY service_label ORDER BY service_label`),
    dbAdmin.execute(sql`SELECT business_date::text AS date, coalesce(sum(no_show_count),0)::int AS no_shows, coalesce(sum(bookings_for_date),0)::int AS bookings FROM reservation_daily_aggregates WHERE ${scope} AND ${days(90)} GROUP BY business_date ORDER BY business_date`),
    dbAdmin.execute(sql`SELECT coalesce(sum(party_size_1_2),0)::int AS party_size_1_2, coalesce(sum(party_size_3_4),0)::int AS party_size_3_4, coalesce(sum(party_size_5_6),0)::int AS party_size_5_6, coalesce(sum(party_size_7_plus),0)::int AS party_size_7_plus FROM reservation_daily_aggregates WHERE ${scope} AND ${days(90)}`),
    dbAdmin.execute(sql`SELECT coalesce(sum(cancel_reason_restaurant_closed),0)::int AS cancel_reason_restaurant_closed, coalesce(sum(cancel_reason_overbooked),0)::int AS cancel_reason_overbooked, coalesce(sum(cancel_reason_kitchen_issue),0)::int AS cancel_reason_kitchen_issue, coalesce(sum(cancel_reason_private_event),0)::int AS cancel_reason_private_event, coalesce(sum(cancel_reason_other),0)::int AS cancel_reason_other, coalesce(sum(cancel_reason_diner),0)::int AS cancel_reason_diner FROM reservation_daily_aggregates WHERE ${scope} AND ${days(90)}`),
    dbAdmin.execute(sql`SELECT coalesce(sum(source_widget),0)::int AS widget, coalesce(sum(source_venue_page),0)::int AS venue_page, coalesce(sum(source_editorial),0)::int AS editorial, coalesce(sum(source_corporate),0)::int AS corporate, coalesce(sum(source_walk_in),0)::int AS walk_in, coalesce(sum(source_manual),0)::int AS manual, coalesce(sum(source_unknown),0)::int AS unknown FROM reservation_daily_aggregates WHERE ${scope} AND ${days(90)}`),
    dbAdmin.execute(sql`SELECT coalesce(sum(bookings_for_date),0)::int AS bookings, coalesce(sum(covers_for_date),0)::int AS covers, coalesce(sum(completed_count),0)::int AS completed, coalesce(sum(no_show_count),0)::int AS no_shows FROM reservation_daily_aggregates WHERE ${scope} AND ${days(7)}`),
    analyticsQueries.cohortRows(orgId),
  ]);

  const cancelRow = (cancelRows as unknown as Array<Record<string, number>>)[0] ?? {};
  const channelRow = (channelRows as unknown as Array<Record<string, number>>)[0] ?? {};
  const ov = (overviewRows as unknown as Array<Record<string, number>>)[0] ?? {};

  const data: AnalyticsViewData = {
    scopeLabel: org.name,
    organizationId: orgId,
    restaurantIds: [], // empty = all venues in org (export job scope)
    tier,
    hasAnyData: (ov.bookings ?? 0) > 0 || (coversRows as unknown[]).length > 0 || (noShowRows as unknown[]).length > 0,
    overview: {
      bookings: ov.bookings ?? 0,
      covers: ov.covers ?? 0,
      completed: ov.completed ?? 0,
      noShows: ov.no_shows ?? 0,
      bookingsDelta: 0,
      coversDelta: 0,
    },
    coversPerService: (coversRows as unknown as Array<{ service_label: string; covers: number }>).map((r) => ({ label: SERVICE_RO[r.service_label] ?? r.service_label, covers: r.covers })),
    noShowTrend: (noShowRows as unknown as Array<{ date: string; no_shows: number; bookings: number }>).map((r) => ({ date: r.date.slice(5), rate: r.bookings > 0 ? r.no_shows / r.bookings : 0 })),
    partyMix: toPartyMixSeries(partyRows as unknown as Array<Record<string, number>>),
    cancellations: toCancellationDonut(cancelRow).map((d) => ({ label: CANCEL_RO[d.reason] ?? d.reason, count: d.count })),
    channel: Object.entries(CHANNEL_RO).map(([key, label]) => ({ label, count: channelRow[key] ?? 0 })),
    // Per-venue Pro charts aren't aggregated at org level in v1 (empty-state); cohort is org-scoped.
    heatMap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => null)),
    cohort: (cohortRows as Array<{ cohort_month: string; month_offset: number; retention_rate: string | null }>).map((c) => ({
      cohort_month: c.cohort_month,
      month_offset: c.month_offset,
      retention_rate: c.retention_rate == null ? null : Number(c.retention_rate),
    })),
    leadTime: [],
    forecast: [],
  };

  return <AnalyticsView data={data} />;
}
