import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { organizations, restaurants, cities } from "@/lib/db/schema";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { StatCard } from "@/components/admin/StatCard";
import { Building2, MapPin, BadgeCheck } from "lucide-react";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";

export const dynamic = "force-dynamic";

export default async function OrgDashboardPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const locale = await resolveAppLocale();
  const m = getMessages(locale, "partner.org");
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  // Layout already gated org.read; this is defence-in-depth.
  if (!(await can(session, "org.read", { kind: "organization", id: orgId }))) redirect("/partner");

  const [org] = await dbAdmin
    .select({
      status: organizations.status,
      currentVenueCount: organizations.currentVenueCount,
      maxVenues: organizations.maxVenues,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!org) redirect("/partner");

  const [sub, venues] = await Promise.all([
    loadActiveSubscription(orgId),
    dbAdmin
      .select({
        id: restaurants.id,
        name: restaurants.name,
        slug: restaurants.slug,
        citySlug: cities.slug,
        cityName: cities.name,
        status: restaurants.status,
        archivedAt: restaurants.archivedAt,
      })
      .from(restaurants)
      .leftJoin(cities, eq(restaurants.cityId, cities.id))
      .where(eq(restaurants.organizationId, orgId))
      .orderBy(asc(restaurants.createdAt)),
  ]);

  const tier = sub?.tier === "pro" && sub.status === "active" ? "pro" : sub?.tier === "pro" ? "pro" : "base";
  const activeCount = venues.filter((v) => !v.archivedAt).length;
  const canAddVenue = await can(session, "org.add_venue", { kind: "organization", id: orgId });

  // Org-wide bookings today (across active venues).
  const [today] = (await dbAdmin.execute(sql`
    SELECT COALESCE(SUM(party_size), 0)::int AS covers, COUNT(*)::int AS bookings
    FROM reservations
    WHERE restaurant_id IN (SELECT id FROM restaurants WHERE organization_id = ${orgId} AND archived_at IS NULL)
      AND reservation_date = CURRENT_DATE
      AND status IN ('confirmed', 'seated', 'completed')
  `)) as unknown as Array<{ covers: number; bookings: number }>;

  return (
    <div className="space-y-10">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label={m.overview.statActiveVenues} value={activeCount} icon={Building2} />
        <StatCard label={m.overview.statPlan} value={tier === "pro" ? m.overview.planPro : m.overview.planBase} icon={BadgeCheck} tone="muted" />
        <StatCard label={m.overview.statBookingsToday} value={today?.bookings ?? 0} />
        <StatCard label={m.overview.statCoversToday} value={today?.covers ?? 0} />
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-text-primary">{m.overview.venuesTitle}</h2>
          <Link
            href={`/partner/org/${orgId}/venues`}
            className="text-sm font-semibold text-brand-primary-dark hover:underline"
          >
            {m.overview.manage}
          </Link>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {venues
            .filter((v) => !v.archivedAt)
            .map((v) => (
              <Link
                key={v.id}
                href={v.citySlug ? `/${v.citySlug}/${v.slug}` : "#"}
                className="group rounded-card border border-border bg-surface-white p-5 transition-shadow hover:shadow-card"
              >
                <h3 className="font-display text-lg text-text-primary">{v.name}</h3>
                <p className="mt-1 inline-flex items-center gap-1 text-sm text-text-secondary">
                  <MapPin size={13} aria-hidden /> {v.cityName ?? m.overview.emptyCity}
                </p>
                <span className="mt-3 inline-block rounded-pill bg-surface-bg px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary ring-1 ring-border">
                  {v.status}
                </span>
              </Link>
            ))}

          {canAddVenue && (
            <Link
              href={`/partner/org/${orgId}/venues/new`}
              className="flex min-h-[120px] items-center justify-center rounded-card border-2 border-dashed border-border text-sm font-semibold text-text-secondary transition-colors hover:border-brand-primary hover:text-brand-primary-dark"
            >
              {m.overview.addVenue}
            </Link>
          )}
        </div>

        {tier === "pro" && activeCount > 3 && (
          <p className="mt-4 text-xs text-text-muted">
            {interpolate(m.overview.surcharge, { extra: activeCount - 3 })}
          </p>
        )}
      </section>
    </div>
  );
}
