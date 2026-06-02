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
import { DetailPageClient } from "./DetailPageClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; city: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, city, slug } = await params;
  const restaurant = await getRestaurantDetail(slug);
  if (!restaurant) return {};
  const base = buildRestaurantMetadata(restaurant, city);
  return {
    ...base,
    alternates: buildAlternates(`/${city}/${slug}`, isLocale(lang) ? lang : "ro", getSiteUrl()),
  };
}

export default async function RestaurantDetailPage({
  params,
}: {
  params: Promise<{ lang: string; city: string; slug: string }>;
}) {
  const { city, slug } = await params;
  const [restaurant, seo] = await Promise.all([
    getRestaurantDetail(slug),
    getRestaurantSeoData(slug),
  ]);

  if (!restaurant) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <h1 className="text-xl font-bold text-text-primary">
          Restaurantul nu a fost găsit
        </h1>
        <Link
          href={`/${city}`}
          className="mt-4 text-brand-primary font-semibold text-sm"
        >
          Înapoi
        </Link>
      </div>
    );
  }

  const jsonLd = buildRestaurantJsonLd({
    detail: restaurant,
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
      <DetailPageClient city={city} slug={slug} restaurant={restaurant} />
    </>
  );
}
