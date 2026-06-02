import type { Metadata } from "next";
import {
  getRestaurants,
  getTrendingRestaurants,
  getNewRestaurants,
} from "@/lib/repos/restaurants-repo";
import { buildAlternates } from "@/lib/i18n/hreflang";
import { getSiteUrl } from "@/lib/site-url";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n/locale";
import { cityDisplayName } from "@/lib/i18n/city-name";
import { FeedPageClient } from "./FeedPageClient";

export const dynamic = "force-dynamic";

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
  const { lang: rawLang, city } = await params;
  const lang = isLocale(rawLang) ? rawLang : DEFAULT_LOCALE;
  const displayCity = cityDisplayName(lang, city);

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
