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
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { FeedPageClient } from "./FeedPageClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; city: string }>;
}): Promise<Metadata> {
  const { lang, city } = await params;
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const displayCity = cityDisplayName(locale, city);
  const meta = getMessages(locale, "discovery").meta;
  return {
    title: interpolate(meta.title, { city: displayCity }),
    description: interpolate(meta.description, { city: displayCity }),
    alternates: buildAlternates(`/${city}`, locale, getSiteUrl()),
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
