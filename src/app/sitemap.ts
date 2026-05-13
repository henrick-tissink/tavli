import type { MetadataRoute } from "next";
import { getSitemapRestaurants } from "@/lib/repos/restaurants-repo";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const restaurants = await getSitemapRestaurants();

  // Dedupe to one entry per city slug. Capability landing pages
  // (`/[city]/events`) are per-city, not per-restaurant, so emitting one
  // URL per unique city is enough — and avoids ballooning the sitemap
  // when a city has many restaurants.
  const citySlugs = Array.from(new Set(restaurants.map((r) => r.citySlug)));

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
  ];
}
