import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import { StatusBadge } from "@/components/status-badge";
import { formatCuisines } from "@/lib/types";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { suspendRestaurant, unsuspendRestaurant } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminRestaurantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const localeRaw = await resolveAppLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const m = getMessages(locale, "admin.restaurants");

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select(
      "id, slug, name, cuisines, status, address, phone, website_url, hero_note, photo_count, vote_count, rating, lat, lng, created_at, organization_id, organizations(id, name), cities(name, slug)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!restaurant) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8 max-w-3xl">
        <h1 className="font-display text-[28px] font-bold text-text-primary">
          {m.notFound.title}
        </h1>
        <p className="text-sm text-text-secondary mt-2">
          {m.notFound.body}
        </p>
        <Link
          href="/admin/restaurants"
          className="text-sm font-semibold text-brand-primary mt-4 inline-block"
        >
          {m.notFound.back}
        </Link>
      </div>
    );
  }

  const city = Array.isArray(restaurant.cities)
    ? restaurant.cities[0]
    : (restaurant.cities as { name: string; slug: string } | null);

  // §3.6 sub-unit B: display the org name + the (active) org-owner's email
  // instead of the raw owner_user_id (which sub-unit C dropped). The nested
  // Supabase select can return either a single object or an array
  // depending on the inferred relationship — handle both for safety.
  const { data: ownerMembership } = restaurant.organization_id
    ? await supabase
        .from("organization_members")
        .select("profiles!inner(email)")
        .eq("organization_id", restaurant.organization_id)
        .eq("role", "owner")
        .eq("is_active", true)
        .maybeSingle()
    : { data: null };

  const ownerEmail = (() => {
    if (!ownerMembership?.profiles) return null;
    const p = ownerMembership.profiles;
    if (Array.isArray(p)) {
      return (p[0] as { email: string | null } | undefined)?.email ?? null;
    }
    return (p as { email: string | null }).email;
  })();

  const orgRow = (() => {
    if (!restaurant.organizations) return null;
    if (Array.isArray(restaurant.organizations)) {
      return (
        (restaurant.organizations[0] as { id: string; name: string } | undefined) ??
        null
      );
    }
    return restaurant.organizations as { id: string; name: string };
  })();

  const publicHref =
    restaurant.status === "live" && city
      ? `/${city.slug}/${restaurant.slug}`
      : null;

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8 max-w-3xl">
      <div className="mb-4">
        <Link
          href="/admin/restaurants"
          className="text-xs font-semibold text-text-muted hover:text-text-primary"
        >
          {m.detail.back}
        </Link>
      </div>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-bold text-text-primary leading-tight">
            {restaurant.name}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {formatCuisines(
              Array.isArray(restaurant.cuisines)
                ? (restaurant.cuisines as string[])
                : [],
            )}
            {city ? ` · ${city.name}` : ""}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge
              status={restaurant.status === "live" ? "open" : "closed"}
              variant="compact"
            />
            <span className="text-xs text-text-muted">
              {m.status.detail[restaurant.status] ?? restaurant.status}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {publicHref && (
            <Link
              href={publicHref}
              className="text-sm font-semibold text-brand-primary"
            >
              {m.detail.viewPublicPage}
            </Link>
          )}
          {restaurant.status === "suspended" ? (
            <form action={async () => {
              "use server";
              await unsuspendRestaurant(restaurant.id);
            }}>
              <button
                type="submit"
                className="text-xs font-semibold px-3 py-1.5 rounded bg-brand-primary text-white hover:opacity-90"
              >
                {m.actions.unsuspend}
              </button>
            </form>
          ) : (
            <form action={async () => {
              "use server";
              await suspendRestaurant(restaurant.id);
            }}>
              <button
                type="submit"
                className="text-xs font-semibold px-3 py-1.5 rounded bg-red-600 text-white hover:opacity-90"
              >
                {m.actions.suspend}
              </button>
            </form>
          )}
        </div>
      </header>

      <dl className="bg-surface-white rounded-card border border-border divide-y divide-border">
        <Row label={m.detail.rows.slug} value={restaurant.slug} />
        <Row label={m.detail.rows.address} value={restaurant.address ?? m.detail.empty} />
        <Row label={m.detail.rows.phone} value={restaurant.phone ?? m.detail.empty} />
        <Row label={m.detail.rows.website} value={restaurant.website_url ?? m.detail.empty} />
        <Row label={m.detail.rows.heroNote} value={restaurant.hero_note ?? m.detail.empty} />
        <Row
          label={m.detail.rows.coordinates}
          value={
            restaurant.lat != null && restaurant.lng != null
              ? `${restaurant.lat}, ${restaurant.lng}`
              : m.detail.notGeocoded
          }
        />
        <Row label={m.detail.rows.photos} value={String(restaurant.photo_count ?? 0)} />
        <Row
          label={m.detail.rows.rating}
          value={
            restaurant.rating != null
              ? interpolate(m.detail.ratingValue, {
                  rating: restaurant.rating,
                  votes: restaurant.vote_count ?? 0,
                })
              : m.detail.noRatings
          }
        />
        <Row
          label={m.detail.rows.organization}
          value={
            orgRow
              ? `${orgRow.name}${ownerEmail ? interpolate(m.detail.ownerSuffix, { email: ownerEmail }) : ""}`
              : m.detail.unassigned
          }
        />
        <Row
          label={m.detail.rows.created}
          value={new Date(restaurant.created_at).toISOString().slice(0, 10)}
        />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <dt className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
        {label}
      </dt>
      <dd className="text-sm text-text-primary text-right break-all">{value}</dd>
    </div>
  );
}
