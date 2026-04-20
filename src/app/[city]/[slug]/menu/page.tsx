import { notFound } from "next/navigation";
import {
  getRestaurantBySlug,
  getRestaurantDetail,
  getMenu,
} from "@/lib/repos/restaurants-repo";
import { MenuPageClient } from "./MenuPageClient";

export const dynamic = "force-dynamic";

export default async function RestaurantMenuPage({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}) {
  const { city, slug } = await params;

  const [restaurant, detail, menu] = await Promise.all([
    getRestaurantBySlug(slug),
    getRestaurantDetail(slug),
    getMenu(slug),
  ]);

  if (!restaurant) notFound();

  const heroPhoto = detail?.photos?.[0] ?? restaurant.photoUrl ?? undefined;

  return (
    <MenuPageClient
      city={city}
      slug={slug}
      restaurant={restaurant}
      menu={menu}
      heroPhoto={heroPhoto}
    />
  );
}
