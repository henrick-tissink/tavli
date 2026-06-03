import type { Metadata } from "next";
import type { RestaurantDetail } from "@/lib/types";
import { formatCuisines } from "@/lib/types";
import { getSiteUrl } from "@/lib/site-url";
import type { Locale } from "@/lib/i18n/locale";
import { getMessages } from "@/lib/i18n/messages";
import { interpolate } from "@/lib/i18n/t";
import { cityDisplayName } from "@/lib/i18n/city-name";

const MAX_DESCRIPTION_LENGTH = 160;

function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 0 ? lastSpace : maxLength;
  return slice.slice(0, cut).trimEnd() + "...";
}

function metaDescription(
  detail: RestaurantDetail,
  locale: Locale,
  citySlug: string,
): string {
  if (detail.description && detail.description.trim().length > 0) {
    return truncateAtWordBoundary(detail.description.trim(), MAX_DESCRIPTION_LENGTH);
  }
  const meta = getMessages(locale, "restaurant").meta;
  return interpolate(meta.descriptionFallback, {
    cuisines: formatCuisines(detail.cuisines, locale).toLowerCase(),
    city: cityDisplayName(locale, citySlug),
  });
}

export function buildRestaurantMetadata(
  detail: RestaurantDetail,
  citySlug: string,
  locale: Locale,
): Metadata {
  const meta = getMessages(locale, "restaurant").meta;
  const title = interpolate(meta.titlePattern, {
    name: detail.name,
    cuisines: formatCuisines(detail.cuisines, locale),
    city: cityDisplayName(locale, citySlug),
  });
  const description = metaDescription(detail, locale, citySlug);
  const url = `${getSiteUrl()}/${citySlug}/${detail.slug}`;
  const images = detail.photoUrl ? [{ url: detail.photoUrl }] : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: detail.photoUrl ? [detail.photoUrl] : undefined,
    },
  };
}
