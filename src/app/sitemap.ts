import type { MetadataRoute } from "next";
import { getSitemapRestaurants } from "@/lib/repos/restaurants-repo";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const restaurants = await getSitemapRestaurants();

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
  ];
}
