import type { Metadata } from "next";
import type { RestaurantDetail } from "@/lib/types";
import { getSiteUrl } from "@/lib/site-url";

const MAX_DESCRIPTION_LENGTH = 160;

function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 0 ? lastSpace : maxLength;
  return slice.slice(0, cut).trimEnd() + "...";
}

function metaDescription(detail: RestaurantDetail): string {
  if (detail.description && detail.description.trim().length > 0) {
    return truncateAtWordBoundary(detail.description.trim(), MAX_DESCRIPTION_LENGTH);
  }
  return `${detail.cuisine} restaurant in ${detail.city}. Book a table on Tavli.`;
}

export function buildRestaurantMetadata(
  detail: RestaurantDetail,
  citySlug: string,
): Metadata {
  const title = `${detail.name} — ${detail.cuisine} in ${detail.city} | Tavli`;
  const description = metaDescription(detail);
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
