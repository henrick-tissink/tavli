"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Restaurant, Menu } from "@/lib/types";
import { MenuViewer } from "@/components/menu-viewer";
import { Button } from "@/components/button";

interface Props {
  city: string;
  slug: string;
  restaurant: Restaurant;
  menu: Menu | null;
  heroPhoto?: string;
}

export function MenuPageClient({
  city,
  slug,
  restaurant,
  menu,
  heroPhoto,
}: Props) {
  const router = useRouter();

  if (!menu) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <h1 className="text-xl font-bold text-text-primary">Menu coming soon</h1>
        <p className="text-sm text-text-secondary mt-2 max-w-sm">
          Please ask your server for a printed copy.
        </p>
        <div className="mt-6">
          <Link href={`/${city}/${slug}`}>
            <Button>Back to {restaurant.name}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <MenuViewer
      restaurant={restaurant}
      menu={menu}
      heroPhoto={heroPhoto}
      onBack={() => router.push(`/${city}/${slug}`)}
    />
  );
}
