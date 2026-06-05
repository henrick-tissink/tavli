/**
 * Restaurant translation loader with row-level locale fallback per §05 §4.3.
 * Uses service-role DB (bypasses RLS) — suitable for venue-page server rendering.
 */

import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import { dbEnabled } from "@/lib/db/enabled";
import { restaurantTranslations } from "@/lib/db/schema";
import { pickTranslationRow } from "./pick";

export type Locale = "ro" | "en" | "de";

interface Deps {
  db: typeof dbAdmin;
  /**
   * Mirrors the repo layer's mock/db switch. When false (mock mode), loaders
   * skip the DB entirely — mock fixtures use integer ids that would otherwise
   * crash against uuid columns. Defaults to true for test injection.
   */
  enabled?: () => boolean;
}

export function makeLoadRestaurantTranslation(deps: Deps) {
  return async function loadRestaurantTranslation(
    restaurantId: string,
    locale: Locale,
  ): Promise<{
    row: typeof restaurantTranslations.$inferSelect | null;
    usedFallback: boolean;
  }> {
    if (!(deps.enabled?.() ?? true)) {
      return { row: null, usedFallback: false };
    }

    const localesToFetch = locale === "ro" ? ["ro"] : ["ro", locale];
    const rows = await deps.db
      .select()
      .from(restaurantTranslations)
      .where(
        and(
          eq(restaurantTranslations.restaurantId, restaurantId),
          inArray(restaurantTranslations.locale, localesToFetch),
        ),
      );

    const ro = rows.find((r) => r.locale === "ro") ?? null;

    if (locale === "ro") {
      return { row: ro, usedFallback: false };
    }

    const requested = rows.find((r) => r.locale === locale) ?? null;

    if (!ro) {
      // Edge case: no RO row exists. Return requested as-is (may be null).
      return { row: requested, usedFallback: false };
    }

    return pickTranslationRow({ requested, ro });
  };
}

export const loadRestaurantTranslation = makeLoadRestaurantTranslation({
  db: dbAdmin,
  enabled: dbEnabled,
});
