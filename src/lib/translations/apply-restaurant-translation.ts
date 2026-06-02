/**
 * Pure overlay helper — maps a restaurantTranslations row onto a
 * RestaurantDetail/Restaurant object.  No DB access; fully testable.
 *
 * Field mapping (restaurantTranslations → RestaurantDetail):
 *   descriptionLong  → description  (preferred)
 *   descriptionShort → description  (fallback when descriptionLong is empty)
 *   heroSubtitle     → heroNote
 *
 * All other RestaurantDetail fields (name, address, schedule, photos, …) are
 * structural / non-translatable content and are left unchanged.
 */

import type { RestaurantDetail } from "@/lib/types";

/** Shape we need from the translation row (subset of restaurantTranslations). */
export interface RestaurantTranslationRow {
  descriptionShort?: string | null;
  descriptionLong?: string | null;
  heroSubtitle?: string | null;
  [key: string]: unknown;
}

/**
 * Return a new RestaurantDetail with translated prose values overlaid.
 * The caller passes `row` only when a non-RO, non-fallback translation exists;
 * if the translation loader already fell back to RO, pass `null` here so the
 * original detail is returned unchanged.
 */
export function applyRestaurantTranslation(
  detail: RestaurantDetail,
  row: RestaurantTranslationRow | null,
): RestaurantDetail {
  if (!row) return detail;

  const translatedDescription =
    (row.descriptionLong?.trim() || "") !== ""
      ? (row.descriptionLong as string)
      : (row.descriptionShort?.trim() || "") !== ""
        ? (row.descriptionShort as string)
        : null;

  const translatedHeroNote =
    (row.heroSubtitle?.trim() || "") !== ""
      ? (row.heroSubtitle as string)
      : null;

  // Only overlay fields that have an authored non-empty value; otherwise keep
  // the original so a partially-authored row doesn't blank out RO content.
  return {
    ...detail,
    ...(translatedDescription !== null
      ? { description: translatedDescription }
      : {}),
    ...(translatedHeroNote !== null ? { heroNote: translatedHeroNote } : {}),
  };
}
