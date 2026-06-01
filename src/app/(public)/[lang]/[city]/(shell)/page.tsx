import {
  getRestaurants,
  getTrendingRestaurants,
  getNewRestaurants,
} from "@/lib/repos/restaurants-repo";
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

export default async function DiscoverFeedPage({
  params,
}: {
  params: Promise<{ city: string }>;
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
