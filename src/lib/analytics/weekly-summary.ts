/**
 * §07 §9 — `analytics.weekly-summary` job. Sundays 20:00 venue-local, per
 * restaurant: assembles last week's metrics from the daily aggregates +
 * reviews, resolves the owner/admin/manager audience, and sends the localized
 * WeeklySummaryEmail. Pro orgs additionally get top source + next-week forecast.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { recordAudit as realRecordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { sendTransactionalEmail } from "@/lib/email/send-transactional";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { render } from "@react-email/render";
import { WeeklySummaryEmail, getSubject } from "@/emails/WeeklySummaryEmail";
import {
  weekBounds,
  computeWeekOverWeekDeltas,
  resolveWeeklyAudience,
  type MemberRow,
} from "@/lib/analytics/weekly-summary-core";

interface Deps {
  db: typeof dbAdmin;
  sendEmail: typeof sendTransactionalEmail;
  recordAudit: typeof realRecordAudit;
  loadTier: (organizationId: string) => Promise<"base" | "pro">;
  now?: () => Date;
}

export interface WeeklySummaryPayload {
  restaurantId?: string;
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function makeWeeklySummary(deps: Deps) {
  const now = deps.now ?? (() => new Date());

  return async function weeklySummary(payload: WeeklySummaryPayload = {}): Promise<void> {
    const restaurants = (await deps.db.execute(sql`
      SELECT id, name, timezone, organization_id FROM restaurants
      WHERE archived_at IS NULL AND status = 'live'
        ${payload.restaurantId ? sql`AND id = ${payload.restaurantId}` : sql``}
    `)) as unknown as Array<{ id: string; name: string; timezone: string; organization_id: string }>;

    for (const r of restaurants) {
      const { start, end } = weekBounds(now(), r.timezone);
      const lastStart = shiftDays(start, -7);
      const lastEnd = shiftDays(end, -7);

      const totalsRows = (await deps.db.execute(sql`
        SELECT
          coalesce(sum(bookings_for_date) FILTER (WHERE business_date BETWEEN ${start}::date AND ${end}::date), 0)::int AS bookings,
          coalesce(sum(covers_for_date) FILTER (WHERE business_date BETWEEN ${start}::date AND ${end}::date), 0)::int AS covers,
          coalesce(sum(completed_count) FILTER (WHERE business_date BETWEEN ${start}::date AND ${end}::date), 0)::int AS completed,
          coalesce(sum(no_show_count) FILTER (WHERE business_date BETWEEN ${start}::date AND ${end}::date), 0)::int AS no_shows,
          coalesce(sum(cancelled_count) FILTER (WHERE business_date BETWEEN ${start}::date AND ${end}::date), 0)::int AS cancellations,
          coalesce(sum(bookings_for_date) FILTER (WHERE business_date BETWEEN ${lastStart}::date AND ${lastEnd}::date), 0)::int AS last_bookings,
          coalesce(sum(covers_for_date) FILTER (WHERE business_date BETWEEN ${lastStart}::date AND ${lastEnd}::date), 0)::int AS last_covers
        FROM reservation_daily_aggregates
        WHERE restaurant_id = ${r.id} AND business_date BETWEEN ${lastStart}::date AND ${end}::date
      `)) as unknown as Array<Record<string, number>>;
      const t = totalsRows[0] ?? {};

      const reviewRows = (await deps.db.execute(sql`
        SELECT count(*)::int AS count, round(avg(rating), 1) AS avg_rating
        FROM reviews
        WHERE restaurant_id = ${r.id}
          AND redacted_at IS NULL
          AND created_at::date BETWEEN ${start}::date AND ${end}::date
      `)) as unknown as Array<{ count: number; avg_rating: number | null }>;
      const reviews = reviewRows[0] ?? { count: 0, avg_rating: null };

      const tier = await deps.loadTier(r.organization_id);
      let pro: { topSource?: string | null; forecastCovers?: number | null } | undefined;
      if (tier === "pro") {
        const proRows = (await deps.db.execute(sql`
          SELECT
            (SELECT coalesce(sum(covers_predicted), 0)::int FROM restaurant_forecasts
              WHERE restaurant_id = ${r.id} AND forecast_date > ${end}::date AND forecast_date <= (${end}::date + interval '7 days')) AS forecast_covers
        `)) as unknown as Array<{ forecast_covers: number }>;
        pro = { forecastCovers: proRows[0]?.forecast_covers ?? null, topSource: null };
      }

      const audienceRows = (await deps.db.execute(sql`
        SELECT p.email, p.locale, m.role, m.is_active AS "isActive"
        FROM organization_members m
        JOIN profiles p ON p.id = m.user_id
        WHERE m.organization_id = ${r.organization_id}
      `)) as unknown as MemberRow[];
      const recipients = resolveWeeklyAudience(audienceRows);
      if (recipients.length === 0) continue;

      const metrics = {
        bookings: t.bookings ?? 0,
        covers: t.covers ?? 0,
        completed: t.completed ?? 0,
        noShows: t.no_shows ?? 0,
        cancellations: t.cancellations ?? 0,
        ...computeWeekOverWeekDeltas(
          { bookings: t.bookings ?? 0, covers: t.covers ?? 0 },
          { bookings: t.last_bookings ?? 0, covers: t.last_covers ?? 0 },
        ),
      };

      for (const recipient of recipients) {
        const props = {
          restaurantName: r.name,
          weekStart: new Date(`${start}T00:00:00Z`),
          weekEnd: new Date(`${end}T00:00:00Z`),
          metrics,
          reviews: { count: reviews.count, avgRating: reviews.avg_rating },
          tier,
          pro,
          locale: recipient.locale,
        };
        const html = await render(WeeklySummaryEmail(props));
        const text = await render(WeeklySummaryEmail(props), { plainText: true });
        await deps.sendEmail({
          to: recipient.email,
          locale: recipient.locale,
          templateKey: "weekly_summary",
          subject: getSubject(recipient.locale, { restaurantName: r.name }),
          html,
          text,
          context: { restaurant_id: r.id, organization_id: r.organization_id },
        });
      }

      await deps.recordAudit({
        action: AUDIT.analytics.weekly_summary_sent,
        subjectType: "restaurant",
        subjectId: r.id,
        actorRole: "system",
        organizationId: r.organization_id,
        restaurantId: r.id,
        context: { week_start: start, week_end: end, recipients: recipients.length },
      });
    }
  };
}

export const weeklySummary = makeWeeklySummary({
  db: dbAdmin,
  sendEmail: sendTransactionalEmail,
  recordAudit: realRecordAudit,
  loadTier: async (orgId) => ((await loadActiveSubscription(orgId))?.tier === "pro" ? "pro" : "base"),
});
