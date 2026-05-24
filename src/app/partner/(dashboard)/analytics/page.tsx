/**
 * §07 §7.1 — partner analytics dashboard (single venue). RSC: resolves the
 * current venue + org + tier, fetches every chart's data server-side (tier-gated
 * via loadActiveSubscription), shapes it, and hands it to the client view.
 */
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import {
  analyticsQueries,
  toPartyMixSeries,
  toCancellationDonut,
  buildHeatMapMatrix,
} from "@/lib/analytics/queries";
import { weekBounds } from "@/lib/analytics/weekly-summary-core";
import { AnalyticsView, type AnalyticsViewData } from "./_components/AnalyticsView";

export const dynamic = "force-dynamic";

const SERVICE_RO: Record<string, string> = {
  brunch: "Brunch",
  lunch: "Prânz",
  dinner: "Cină",
  late: "Târziu",
  all_day: "Toată ziua",
};
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

function NoVenue() {
  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8">
      <div className="rounded-card border border-border bg-surface-white p-10 text-center">
        <p className="font-semibold text-text-primary">Niciun restaurant asociat acestui cont.</p>
      </div>
    </div>
  );
}

export default async function PartnerAnalyticsPage() {
  const session = await getCurrentSession();
  const restaurantId = session ? await currentUserPrimaryRestaurant(session) : null;
  if (!restaurantId) return <NoVenue />;

  const [venue] = await dbAdmin.execute(sql`
    SELECT id, name, organization_id AS "organizationId", timezone FROM restaurants WHERE id = ${restaurantId}
  `) as unknown as Array<{ id: string; name: string; organizationId: string; timezone: string }>;
  if (!venue) return <NoVenue />;

  const sub = await loadActiveSubscription(venue.organizationId);
  const tier: "base" | "pro" = sub?.tier === "pro" && sub.status === "active" ? "pro" : "base";

  const q = analyticsQueries;
  const [coversRows, noShowRows, partyRows, cancelRow, channelRow, overview] = await Promise.all([
    q.coversPerService(restaurantId, tier),
    q.noShowTrend(restaurantId, tier),
    q.partyMixRows(restaurantId, tier),
    q.cancellationRow(restaurantId, tier),
    q.channelRows(restaurantId),
    loadOverview(restaurantId, venue.timezone),
  ]);
  const [heatRows, cohortRows, leadRows, forecastRows] = isProFetch(tier)
    ? await Promise.all([q.heatMapRows(restaurantId), q.cohortRows(venue.organizationId), q.leadTimeRows(restaurantId), q.forecastRows(restaurantId)])
    : [[], [], [], []];

  const coversPerService = coversRows.map((r) => ({ label: SERVICE_RO[r.service_label] ?? r.service_label, covers: r.covers }));
  const noShowTrend = noShowRows.map((r) => ({
    date: r.date.slice(5),
    rate: r.bookings > 0 ? r.no_shows / r.bookings : 0,
  }));
  const partyMix = toPartyMixSeries(partyRows);
  const cancellations = toCancellationDonut(cancelRow).map((d) => ({ label: CANCEL_RO[d.reason] ?? d.reason, count: d.count }));
  const channel = Object.entries(CHANNEL_RO).map(([key, label]) => ({ label, count: (channelRow as Record<string, number>)[key] ?? 0 }));

  const data: AnalyticsViewData = {
    scopeLabel: venue.name,
    organizationId: venue.organizationId,
    restaurantIds: [restaurantId],
    tier,
    hasAnyData: overview.bookings > 0 || coversPerService.length > 0 || noShowTrend.length > 0,
    overview,
    coversPerService,
    noShowTrend,
    partyMix,
    cancellations,
    heatMap: buildHeatMapMatrix(heatRows as never),
    cohort: (cohortRows as Array<{ cohort_month: string; month_offset: number; retention_rate: string | null }>).map((c) => ({
      cohort_month: c.cohort_month,
      month_offset: c.month_offset,
      retention_rate: c.retention_rate == null ? null : Number(c.retention_rate),
    })),
    leadTime: (leadRows as Array<{ date: string; lead_time_p50_min: number; lead_time_p90_min: number }>).map((l) => ({
      date: l.date.slice(5),
      p50: l.lead_time_p50_min,
      p90: l.lead_time_p90_min,
    })),
    channel,
    forecast: (forecastRows as Array<{ date: string; covers_predicted: number; covers_low: number; covers_high: number; bookings_already_confirmed: number }>).map((f) => ({
      date: f.date.slice(5),
      predicted: f.covers_predicted,
      low: f.covers_low,
      high: f.covers_high,
      confirmed: f.bookings_already_confirmed,
    })),
  };

  return <AnalyticsView data={data} />;
}

function isProFetch(tier: "base" | "pro"): boolean {
  return tier === "pro";
}

/** This-week-vs-last-week overview from the daily aggregates (venue-local week). */
async function loadOverview(restaurantId: string, timezone: string): Promise<AnalyticsViewData["overview"]> {
  const { start, end } = weekBounds(new Date(), timezone);
  const lastStart = shift(start, -7);
  const lastEnd = shift(end, -7);
  const rows = (await dbAdmin.execute(sql`
    SELECT
      coalesce(sum(bookings_for_date) FILTER (WHERE business_date BETWEEN ${start}::date AND ${end}::date), 0)::int AS bookings,
      coalesce(sum(covers_for_date) FILTER (WHERE business_date BETWEEN ${start}::date AND ${end}::date), 0)::int AS covers,
      coalesce(sum(completed_count) FILTER (WHERE business_date BETWEEN ${start}::date AND ${end}::date), 0)::int AS completed,
      coalesce(sum(no_show_count) FILTER (WHERE business_date BETWEEN ${start}::date AND ${end}::date), 0)::int AS no_shows,
      coalesce(sum(bookings_for_date) FILTER (WHERE business_date BETWEEN ${lastStart}::date AND ${lastEnd}::date), 0)::int AS last_bookings,
      coalesce(sum(covers_for_date) FILTER (WHERE business_date BETWEEN ${lastStart}::date AND ${lastEnd}::date), 0)::int AS last_covers
    FROM reservation_daily_aggregates
    WHERE restaurant_id = ${restaurantId} AND business_date BETWEEN ${lastStart}::date AND ${end}::date
  `)) as unknown as Array<Record<string, number>>;
  const t = rows[0] ?? {};
  return {
    bookings: t.bookings ?? 0,
    covers: t.covers ?? 0,
    completed: t.completed ?? 0,
    noShows: t.no_shows ?? 0,
    bookingsDelta: (t.bookings ?? 0) - (t.last_bookings ?? 0),
    coversDelta: (t.covers ?? 0) - (t.last_covers ?? 0),
  };
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
