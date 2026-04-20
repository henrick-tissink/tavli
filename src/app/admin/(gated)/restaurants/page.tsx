import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import { StatusBadge } from "@/components/status-badge";

const STATUS_TONE: Record<
  string,
  "open" | "closed"
> = {
  live: "open",
  pending_review: "closed",
  draft: "closed",
  suspended: "closed",
};

const STATUS_LABEL: Record<string, string> = {
  live: "Live",
  pending_review: "Pending",
  draft: "Draft",
  suspended: "Suspended",
};

export default async function AdminRestaurantsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: restaurants, error } = await supabase
    .from("restaurants")
    .select(
      "id, slug, name, cuisine, status, created_at, city_id, cities(name)",
    )
    .order("created_at", { ascending: false });

  return (
    <div className="px-8 py-8 max-w-6xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
            Restaurants
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {restaurants?.length ?? 0} restaurants across all statuses
          </p>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 text-red-900 border border-red-200 rounded-card p-4 text-sm mb-4">
          Could not load restaurants: {error.message}
        </div>
      )}

      <div className="bg-surface-white rounded-card border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-bg">
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold text-text-secondary">Name</th>
              <th className="px-4 py-3 font-semibold text-text-secondary">Cuisine</th>
              <th className="px-4 py-3 font-semibold text-text-secondary">City</th>
              <th className="px-4 py-3 font-semibold text-text-secondary">Status</th>
              <th className="px-4 py-3 font-semibold text-text-secondary text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(restaurants ?? []).map((r) => {
              const cityName = Array.isArray(r.cities)
                ? r.cities[0]?.name
                : (r.cities as { name: string } | null)?.name;
              return (
                <tr key={r.id} className="hover:bg-surface-bg/50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-text-primary">
                    {r.name}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{r.cuisine}</td>
                  <td className="px-4 py-3 text-text-secondary">{cityName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={STATUS_TONE[r.status] ?? "closed"}
                      variant="compact"
                    />
                    <span className="ml-2 text-xs text-text-muted">
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/restaurants/${r.id}`}
                      className="text-brand-primary text-xs font-semibold hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(!restaurants || restaurants.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-muted">
                  No restaurants yet. Send an invitation to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
