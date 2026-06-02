import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import { StatusBadge } from "@/components/status-badge";
import { resolveAppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { translate, interpolate } from "@/lib/i18n/t";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/locale";

const STATUS_TONE: Record<
  string,
  "open" | "closed"
> = {
  live: "open",
  pending_review: "closed",
  draft: "closed",
  suspended: "closed",
};

export default async function AdminRestaurantsPage() {
  const supabase = await createSupabaseServerClient();
  const localeRaw = await resolveAppLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const m = getMessages(locale, "admin.restaurants");

  const { data: restaurants, error } = await supabase
    .from("restaurants")
    .select(
      "id, slug, name, cuisines, status, created_at, city_id, cities(name)",
    )
    .order("created_at", { ascending: false });

  const count = restaurants?.length ?? 0;

  return (
    <div className="px-4 py-6 desktop:px-8 desktop:py-8 max-w-6xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-[36px] font-bold text-text-primary leading-tight">
            {m.list.title}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {translate(locale, m.list.subtitle, { count })}
          </p>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 text-red-900 border border-red-200 rounded-card p-4 text-sm mb-4">
          {interpolate(m.list.loadError, { message: error.message })}
        </div>
      )}

      <div className="bg-surface-white rounded-card border border-border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-surface-bg">
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold text-text-secondary">{m.list.table.name}</th>
              <th className="px-4 py-3 font-semibold text-text-secondary">{m.list.table.cuisine}</th>
              <th className="px-4 py-3 font-semibold text-text-secondary">{m.list.table.city}</th>
              <th className="px-4 py-3 font-semibold text-text-secondary">{m.list.table.status}</th>
              <th className="px-4 py-3 font-semibold text-text-secondary text-right">
                {m.list.table.actions}
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
                  <td className="px-4 py-3 text-text-secondary">
                    {Array.isArray(r.cuisines) && r.cuisines.length > 0
                      ? r.cuisines.join(" · ")
                      : m.detail.empty}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{cityName ?? m.detail.empty}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={STATUS_TONE[r.status] ?? "closed"}
                      variant="compact"
                    />
                    <span className="ml-2 text-xs text-text-muted">
                      {m.status.list[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/restaurants/${r.id}`}
                      className="text-brand-primary text-xs font-semibold hover:underline"
                    >
                      {m.list.view}
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(!restaurants || restaurants.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-muted">
                  {m.list.empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
