import Link from "next/link";
import { getRestaurantDetail } from "@/lib/repos/restaurants-repo";
import { DetailPageClient } from "./DetailPageClient";

export const dynamic = "force-dynamic";

export default async function RestaurantDetailPage({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}) {
  const { city, slug } = await params;
  const restaurant = await getRestaurantDetail(slug);

  if (!restaurant) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <h1 className="text-xl font-bold text-text-primary">
          Restaurant not found
        </h1>
        <Link
          href={`/${city}`}
          className="mt-4 text-brand-primary font-semibold text-sm"
        >
          Go back
        </Link>
      </div>
    );
  }

  return <DetailPageClient city={city} slug={slug} restaurant={restaurant} />;
}
