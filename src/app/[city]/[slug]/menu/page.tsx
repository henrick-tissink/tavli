"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import {
  getRestaurantBySlug,
  getRestaurantDetail,
} from "@/lib/repos/restaurants-repo";
import { getMenu } from "@/lib/repos/restaurants-repo";
import { MenuViewer } from "@/components/menu-viewer";
import { Button } from "@/components/button";

export default function RestaurantMenuPage({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}) {
  const { city, slug } = use(params);
  const router = useRouter();

  const restaurant = getRestaurantBySlug(slug);
  const detail = getRestaurantDetail(slug);
  const menu = restaurant ? getMenu(slug) : null;

  if (!restaurant) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <h1 className="text-xl font-bold text-text-primary">
          Restaurant not found
        </h1>
        <button
          type="button"
          onClick={() => router.push(`/${city}`)}
          className="mt-4 text-brand-primary font-semibold text-sm"
        >
          Back to discovery
        </button>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <h1 className="text-xl font-bold text-text-primary">Menu coming soon</h1>
        <p className="text-sm text-text-secondary mt-2 max-w-sm">
          {restaurant.name} hasn&apos;t shared their full menu with us yet.
        </p>
        <div className="mt-6">
          <Button onClick={() => router.push(`/${city}/${slug}`)}>
            Back to {restaurant.name}
          </Button>
        </div>
      </div>
    );
  }

  const heroPhoto =
    detail?.photos?.[0] ?? restaurant.photoUrl ?? undefined;

  return (
    <MenuViewer
      restaurant={restaurant}
      menu={menu}
      heroPhoto={heroPhoto}
      onBack={() => router.push(`/${city}/${slug}`)}
    />
  );
}
