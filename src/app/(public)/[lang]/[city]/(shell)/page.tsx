import type { Metadata } from "next";
import {
  getRestaurants,
  getTrendingRestaurants,
  getNewRestaurants,
} from "@/lib/repos/restaurants-repo";
import { buildAlternates } from "@/lib/i18n/hreflang";
import { getSiteUrl } from "@/lib/site-url";
import { isLocale } from "@/lib/i18n/locale";
import { FeedPageClient } from "./FeedPageClient";

export const dynamic = "force-dynamic";

const CITY_DISPLAY_NAMES: Record<string, string> = {
  bucuresti: "București",
  cluj: "Cluj",
  timisoara: "Timișoara",
  brasov: "Brașov",
  iasi: "Iași",
  istanbul: "Istanbul",
};

function formatCityName(slug: string): string {
  return (
    CITY_DISPLAY_NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1)
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; city: string }>;
}): Promise<Metadata> {
  const { lang, city } = await params;
  return {
    alternates: buildAlternates(`/${city}`, isLocale(lang) ? lang : "ro", getSiteUrl()),
  };
}

export default async function DiscoverFeedPage({
  params,
}: {
  params: Promise<{ lang: string; city: string }>;
}) {
  const { city } = await params;
  const displayCity = formatCityName(city);

  const [allRestaurants, trending, newest] = await Promise.all([
    getRestaurants(),
    getTrendingRestaurants(),
    getNewRestaurants(),
  ]);

  return (
    <FeedPageClient
      city={city}
      displayCity={displayCity}
      allRestaurants={allRestaurants}
      trending={trending}
      newest={newest}
    />
  );
}
