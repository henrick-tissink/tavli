import Link from "next/link";
import type { Metadata } from "next";
import {
  getRestaurantDetail,
  getRestaurantSeoData,
} from "@/lib/repos/restaurants-repo";
import { buildRestaurantMetadata } from "@/lib/seo/restaurant-metadata";
import {
  buildRestaurantJsonLd,
  serializeJsonLd,
} from "@/lib/seo/restaurant-jsonld";
import { buildAlternates } from "@/lib/i18n/hreflang";
import { getSiteUrl } from "@/lib/site-url";
import { isLocale } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { localizedHref } from "@/lib/i18n/routing";
import { loadRestaurantTranslation } from "@/lib/translations/load";
import { applyRestaurantTranslation } from "@/lib/translations/apply-restaurant-translation";
import { loadMenuItemTranslations } from "@/lib/translations/load-menu";
import { applyChefPickTranslations } from "@/lib/translations/apply-menu-translation";
import { DetailPageClient } from "./DetailPageClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; city: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, city, slug } = await params;
  const locale = isLocale(lang) ? lang : "ro";
  let restaurant = await getRestaurantDetail(slug);
  if (!restaurant) return {};
  // Localize the SEO metadata too — otherwise an /en or /de page advertises
  // Romanian title/description/JSON-LD even when the body is translated.
  if (locale !== "ro") {
    const { row, usedFallback } = await loadRestaurantTranslation(restaurant.id, locale);
    restaurant = applyRestaurantTranslation(restaurant, usedFallback ? null : row);
  }
  const base = buildRestaurantMetadata(restaurant, city, locale);
  return {
    ...base,
    alternates: buildAlternates(`/${city}/${slug}`, locale, getSiteUrl()),
  };
}

export default async function RestaurantDetailPage({
  params,
}: {
  params: Promise<{ lang: string; city: string; slug: string }>;
}) {
  const { lang, city, slug } = await params;
  const m = getMessages(lang, "restaurant");
  const locale = isLocale(lang) ? lang : "ro";
  const [restaurant, seo] = await Promise.all([
    getRestaurantDetail(slug),
    getRestaurantSeoData(slug),
  ]);

  // Overlay partner-authored content translations (non-RO locales only).
  // loadRestaurantTranslation returns usedFallback=true (and row=null) only when
  // the locale has no translation row at all; otherwise the row is overlaid
  // field-by-field, with applyRestaurantTranslation keeping the RO base for any
  // field the partner left empty.
  let localizedRestaurant = restaurant;
  if (restaurant && locale !== "ro") {
    const chefPickIds = restaurant.chefPicks.map((p) => p.id);
    const [{ row, usedFallback }, chefPickItemMap] = await Promise.all([
      loadRestaurantTranslation(restaurant.id, locale),
      loadMenuItemTranslations(chefPickIds, locale),
    ]);
    const withRestaurantTranslation = applyRestaurantTranslation(
      restaurant,
      usedFallback ? null : row,
    );
    localizedRestaurant = {
      ...withRestaurantTranslation,
      chefPicks: applyChefPickTranslations(withRestaurantTranslation.chefPicks, chefPickItemMap),
    };
  }

  if (!localizedRestaurant) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <h1 className="text-xl font-bold text-text-primary">
          {m.notFound.title}
        </h1>
        <Link
          href={localizedHref(`/${city}`, isLocale(lang) ? lang : "ro")}
          className="mt-4 text-brand-primary font-semibold text-sm"
        >
          {m.notFound.back}
        </Link>
      </div>
    );
  }

  const jsonLd = buildRestaurantJsonLd({
    detail: localizedRestaurant,
    citySlug: city,
    countryCode: seo.countryCode,
    phone: seo.phone,
    availability: seo.availability,
    hasMenu: seo.hasMenu,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <DetailPageClient city={city} slug={slug} restaurant={localizedRestaurant} />
    </>
  );
}
