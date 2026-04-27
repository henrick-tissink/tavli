import type { RestaurantDetail } from "@/lib/types";
import { getSiteUrl } from "@/lib/site-url";

export interface AvailabilitySlot {
  dayOfWeek: number; // 0=Sun..6=Sat
  slotStart: string; // "HH:MM" or "HH:MM:SS"
  slotEnd: string;
}

export interface RestaurantJsonLdInput {
  detail: RestaurantDetail;
  citySlug: string;
  countryCode: string;
  phone: string | null;
  availability: AvailabilitySlot[];
  hasMenu: boolean;
}

const DOW_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function trimSeconds(time: string): string {
  return time.length > 5 ? time.slice(0, 5) : time;
}

function hoursSpec(slots: AvailabilitySlot[]) {
  return slots.map((s) => ({
    "@type": "OpeningHoursSpecification" as const,
    dayOfWeek: DOW_NAMES[s.dayOfWeek],
    opens: trimSeconds(s.slotStart),
    closes: trimSeconds(s.slotEnd),
  }));
}

export function buildRestaurantJsonLd(
  input: RestaurantJsonLdInput,
): Record<string, unknown> {
  const { detail, citySlug, countryCode, phone, availability, hasMenu } = input;
  const url = `${getSiteUrl()}/${citySlug}/${detail.slug}`;

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: detail.name,
    url,
    image: detail.photos,
    address: {
      "@type": "PostalAddress",
      streetAddress: detail.address,
      addressLocality: detail.city,
      addressCountry: countryCode,
    },
    servesCuisine: detail.cuisine,
    priceRange: "$".repeat(detail.priceLevel),
    acceptsReservations: true,
  };

  if (detail.lat !== 0 || detail.lng !== 0) {
    ld.geo = {
      "@type": "GeoCoordinates",
      latitude: detail.lat,
      longitude: detail.lng,
    };
  }

  if (detail.voteCount > 0) {
    ld.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: detail.rating,
      reviewCount: detail.voteCount,
    };
  }

  if (availability.length > 0) {
    ld.openingHoursSpecification = hoursSpec(availability);
  }

  if (hasMenu) {
    ld.hasMenu = `${url}/menu`;
  }

  if (phone) {
    ld.telephone = phone;
  }

  return ld;
}

/**
 * JSON-LD serialization with `<` escaped to `<` so partner-controlled
 * fields can never break out of the surrounding `<script>` tag.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
