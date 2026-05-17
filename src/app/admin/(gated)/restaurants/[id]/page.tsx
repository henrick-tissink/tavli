import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import { StatusBadge } from "@/components/status-badge";
import { formatCuisines } from "@/lib/types";
import { suspendRestaurant, unsuspendRestaurant } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  live: "Live",
  pending_review: "Pending review",
  draft: "Draft",
  suspended: "Suspended",
};

export const dynamic = "force-dynamic";

export default async function AdminRestaurantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select(
      "id, slug, name, cuisines, status, address, phone, website_url, hero_note, photo_count, vote_count, rating, lat, lng, created_at, owner_user_id, cities(name, slug)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!restaurant) {
    return (
      <div className="px-4 py-6 desktop:px-8 desktop:py-8 max-w-3xl">
        <h1 className="font-display text-[28px] font-bold text-text-primary">
          Restaurant not found
        </h1>
        <p className="text-sm text-text-secondary mt-2">
          The restaurant you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <Link
          href="/admin/restaurants"
          className="text-sm font-semibold text-brand-primary mt-4 inline-block"
        >
          ← Back to restaurants
        </Link>
      </div>
    );
  }

  const city = Array.isArray(restaurant.cities)
    ? restaurant.cities[0]
    : (restaurant.cities as { name: string; slug: string } | null);

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
          ← Restaurants
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
              {STATUS_LABEL[restaurant.status] ?? restaurant.status}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {publicHref && (
            <Link
              href={publicHref}
              className="text-sm font-semibold text-brand-primary"
            >
              View public page →
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
                Unsuspend
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
                Suspend
              </button>
            </form>
          )}
        </div>
      </header>

      <dl className="bg-surface-white rounded-card border border-border divide-y divide-border">
        <Row label="Slug" value={restaurant.slug} />
        <Row label="Address" value={restaurant.address ?? "—"} />
        <Row label="Phone" value={restaurant.phone ?? "—"} />
        <Row label="Website" value={restaurant.website_url ?? "—"} />
        <Row label="Hero note" value={restaurant.hero_note ?? "—"} />
        <Row
          label="Coordinates"
          value={
            restaurant.lat != null && restaurant.lng != null
              ? `${restaurant.lat}, ${restaurant.lng}`
              : "Not geocoded"
          }
        />
        <Row label="Photos" value={String(restaurant.photo_count ?? 0)} />
        <Row
          label="Rating"
          value={
            restaurant.rating != null
              ? `${restaurant.rating} (${restaurant.vote_count} votes)`
              : "No ratings yet"
          }
        />
        <Row
          label="Owner user id"
          value={restaurant.owner_user_id ?? "Unassigned"}
        />
        <Row
          label="Created"
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
