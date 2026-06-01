import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { dbAdmin } from "@/lib/db/admin";
import { restaurants, cities } from "@/lib/db/schema";
import { VenueRowActions } from "./_components/VenueRowActions";

export const dynamic = "force-dynamic";

const fmtDate = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short", year: "numeric" }).format(d) : "—";

export default async function OrgVenuesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const session = await getCurrentSession();
  if (!session) redirect("/partner/sign-in");
  if (!(await can(session, "org.read", { kind: "organization", id: orgId }))) redirect("/partner");

  const canAddVenue = await can(session, "org.add_venue", { kind: "organization", id: orgId });
  const venues = await dbAdmin
    .select({
      id: restaurants.id,
      name: restaurants.name,
      cityName: cities.name,
      status: restaurants.status,
      archivedAt: restaurants.archivedAt,
      createdAt: restaurants.createdAt,
    })
    .from(restaurants)
    .leftJoin(cities, eq(restaurants.cityId, cities.id))
    .where(eq(restaurants.organizationId, orgId))
    .orderBy(asc(restaurants.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-text-primary">Toate locațiile</h2>
        {canAddVenue && (
          <Link
            href={`/partner/org/${orgId}/venues/new`}
            className="inline-flex min-h-[40px] items-center rounded-button bg-brand-primary px-4 py-2 text-sm font-bold text-white shadow-card hover:bg-brand-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            + Adaugă o locație
          </Link>
        )}
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface-white">
        {venues.map((v) => (
          <li
            key={v.id}
            className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${v.archivedAt ? "opacity-60" : ""}`}
          >
            <div className="min-w-0">
              <p className="font-medium text-text-primary">{v.name}</p>
              <p className="text-xs text-text-secondary">
                {v.cityName ?? "—"} · adăugată {fmtDate(v.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-pill bg-surface-bg px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary ring-1 ring-border">
                {v.archivedAt ? "Dezactivată" : v.status}
              </span>
              <VenueRowActions organizationId={orgId} restaurantId={v.id} archived={!!v.archivedAt} />
            </div>
          </li>
        ))}
        {venues.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-text-muted">Nicio locație încă.</li>
        )}
      </ul>
    </div>
  );
}
