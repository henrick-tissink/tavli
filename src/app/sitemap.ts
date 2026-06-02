import type { MetadataRoute } from "next";
import { getSitemapRestaurants } from "@/lib/repos/restaurants-repo";
import { getSiteUrl } from "@/lib/site-url";
import { LOCALES, type Locale } from "@/lib/i18n/locale";
import { buildAlternates } from "@/lib/i18n/hreflang";

export const dynamic = "force-dynamic";

/**
 * Emit one sitemap entry per locale for a given unprefixed path, each carrying
 * the full set of hreflang alternates. The canonical URL for each entry is the
 * locale-prefixed one (RO is unprefixed per our routing convention).
 */
function localized(
  unprefixedPath: string,
  base: string,
  lastModified: Date,
  changeFrequency: "weekly" | "daily" | "monthly",
  priority: number,
): MetadataRoute.Sitemap {
  return LOCALES.map((l: Locale) => {
    const alt = buildAlternates(unprefixedPath, l, base);
    return {
      url: alt.canonical,
      lastModified,
      changeFrequency,
      priority,
      alternates: { languages: alt.languages },
    };
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const restaurants = await getSitemapRestaurants();

  // Dedupe to one entry per city slug. Capability landing pages
  // (`/[city]/events`) are per-city, not per-restaurant, so emitting one
  // URL per unique city is enough — and avoids ballooning the sitemap
  // when a city has many restaurants.
  const citySlugs = Array.from(new Set(restaurants.map((r) => r.citySlug)));

  return [
    // Home — 3 locale entries (RO unprefixed, EN /en, DE /de)
    ...localized("/", base, new Date(), "weekly", 1.0),

    // Per-restaurant detail pages — 3 locale entries each
    ...restaurants.flatMap((r) =>
      localized(`/${r.citySlug}/${r.slug}`, base, r.updatedAt, "daily", 0.7),
    ),

    // City events pages — 3 locale entries per city
    ...citySlugs.flatMap((slug) =>
      localized(`/${slug}/events`, base, new Date(), "weekly", 0.6),
    ),

    // Pricing — 3 locale entries (Phase 0; now unified with same helper)
    ...localized("/pricing", base, new Date(), "monthly", 0.8),
  ];
}
