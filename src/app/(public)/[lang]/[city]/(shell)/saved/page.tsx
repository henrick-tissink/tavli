import { getRestaurants } from "@/lib/repos/restaurants-repo";
import { SavedPageClient } from "./SavedPageClient";

export const dynamic = "force-dynamic";

export default async function SavedPage({
  params,
}: {
  params: Promise<{ lang: string; city: string }>;
}) {
  const { city } = await params;
  const allRestaurants = await getRestaurants();

  return <SavedPageClient city={city} allRestaurants={allRestaurants} />;
}
