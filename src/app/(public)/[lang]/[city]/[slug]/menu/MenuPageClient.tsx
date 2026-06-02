"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Restaurant, Menu } from "@/lib/types";
import { MenuViewer } from "@/components/menu-viewer";
import { Button } from "@/components/button";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { localizedHref } from "@/lib/i18n/routing";

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
  const t = useT("menu");
  const locale = useLocale();
  const restaurantHref = localizedHref(`/${city}/${slug}`, locale);

  if (!menu) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <h1 className="text-xl font-bold text-text-primary">{t("pageClient.noMenuTitle")}</h1>
        <p className="text-sm text-text-secondary mt-2 max-w-sm">
          {t("pageClient.noMenuBody")}
        </p>
        <div className="mt-6">
          <Link href={restaurantHref}>
            <Button>{t("pageClient.backTo", { name: restaurant.name })}</Button>
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
      onBack={() => router.push(restaurantHref)}
    />
  );
}
