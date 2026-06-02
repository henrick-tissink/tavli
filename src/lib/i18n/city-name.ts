import { getMessages } from "./messages";
import { type Locale } from "./locale";

/**
 * Localized display name for a city slug, sourced from the `common.cities`
 * catalogue (e.g. "bucuresti" → "Bucharest" in EN, "Bukarest" in DE,
 * "București" in RO). Falls back to a capitalized slug for unknown cities.
 *
 * Server-only by convention (imports the full message registry). Client
 * components should read city names via `useT("common")` instead.
 */
export function cityDisplayName(locale: Locale, slug: string): string {
  const cities = getMessages(locale, "common").cities as Record<string, string>;
  return cities[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}
