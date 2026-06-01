import { getRestaurants } from "@/lib/repos/restaurants-repo";
import { MapPageClient } from "./MapPageClient";

export const dynamic = "force-dynamic";

export default async function MapPage({
  params,
}: {
  params: Promise<{ lang: string; city: string }>;
}) {
  const { city } = await params;
  const allRestaurants = await getRestaurants();
  return <MapPageClient city={city} allRestaurants={allRestaurants} />;
}
