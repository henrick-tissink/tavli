import type { MetadataRoute } from "next";
import { getSitemapRestaurants } from "@/lib/repos/restaurants-repo";
import { getSiteUrl } from "@/lib/site-url";
import { LOCALES } from "@/lib/i18n/locale";
import { buildAlternates } from "@/lib/i18n/hreflang";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const restaurants = await getSitemapRestaurants();

  // Dedupe to one entry per city slug. Capability landing pages
  // (`/[city]/events`) are per-city, not per-restaurant, so emitting one
  // URL per unique city is enough — and avoids ballooning the sitemap
  // when a city has many restaurants.
  const citySlugs = Array.from(new Set(restaurants.map((r) => r.citySlug)));

  // Per-locale pricing entries (Phase 0: only pricing is under [lang]).
  // Storefront/home/city entries remain RO-only until Phase 1.
  const pricingEntries: MetadataRoute.Sitemap = LOCALES.map((l) => {
    const alt = buildAlternates("/pricing", l, base);
    return {
      url: alt.canonical,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
      alternates: { languages: alt.languages },
    };
  });

  return [
    {
      url: `${base}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    ...restaurants.map((r) => ({
      url: `${base}/${r.citySlug}/${r.slug}`,
      lastModified: r.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...citySlugs.map((slug) => ({
      url: `${base}/${slug}/events`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...pricingEntries,
  ];
}
