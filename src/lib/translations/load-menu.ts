/**
 * Menu content translation loader with per-row locale fallback per §05 §4.3.
 * Uses service-role DB (bypasses RLS) — suitable for menu page server rendering.
 *
 * Per-row fallback: each section/item falls back to RO independently if its
 * translated name is missing or empty (unlike the all-or-nothing restaurant
 * fallback, menu items are independent content units).
 *
 * Returns lookup maps keyed by section id / item id so the caller can do
 * O(1) overlay without mutating the original menu shape.
 */

import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { dbAdmin } from "@/lib/db/admin";
import {
  menuSections,
  menuItems,
  menuSectionTranslations,
  menuItemTranslations,
  menuTranslations,
} from "@/lib/db/schema";

export type Locale = "ro" | "en" | "de";

/** Translated fields for a single menu section. */
export interface SectionTranslation {
  name: string;
  intro?: string;
}

/** Translated fields for a single menu item. */
export interface ItemTranslation {
  name: string;
  description?: string;
}

/** Output of loadMenuTranslations: lookup maps + optional menu-level heroNote. */
export interface MenuTranslations {
  /** Map from section id → translated { name, intro }. Only entries with a translation are present. */
  sections: Map<string, SectionTranslation>;
  /** Map from item id → translated { name, description }. Only entries with a translation are present. */
  items: Map<string, ItemTranslation>;
  /** Translated hero note (from menu_translations), or undefined if not authored. */
  heroNote?: string;
}

interface Deps {
  db: typeof dbAdmin;
}

/**
 * Per-row fallback: return the translated name if non-empty, else null (→ caller keeps RO).
 * Required field for sections and items is `name`.
 */
function pickTranslatedName(translatedName: string | null | undefined): string | null {
  const t = translatedName?.trim() ?? "";
  return t.length > 0 ? t : null;
}

export function makeLoadMenuTranslations(deps: Deps) {
  return async function loadMenuTranslations(
    restaurantId: string,
    locale: Locale,
  ): Promise<MenuTranslations> {
    // RO: no translation needed, return empty maps (caller renders original data).
    if (locale === "ro") {
      return { sections: new Map(), items: new Map() };
    }

    // Step 1 — find all section ids and item ids for this restaurant.
    const [sectionRows, itemRows] = await Promise.all([
      deps.db
        .select({ id: menuSections.id })
        .from(menuSections)
        .where(eq(menuSections.restaurantId, restaurantId)),
      deps.db
        .select({ id: menuItems.id })
        .from(menuItems)
        .where(eq(menuItems.restaurantId, restaurantId)),
    ]);

    const sectionIds = sectionRows.map((r) => r.id);
    const itemIds = itemRows.map((r) => r.id);

    if (sectionIds.length === 0 && itemIds.length === 0) {
      return { sections: new Map(), items: new Map() };
    }

    // Step 2 — fetch translated rows for the requested locale in parallel with menu-level heroNote.
    const [sectionTransRows, itemTransRows, menuTransRow] = await Promise.all([
      sectionIds.length > 0
        ? deps.db
            .select()
            .from(menuSectionTranslations)
            .where(
              and(
                inArray(menuSectionTranslations.sectionId, sectionIds),
                eq(menuSectionTranslations.locale, locale),
              ),
            )
        : Promise.resolve([]),
      itemIds.length > 0
        ? deps.db
            .select()
            .from(menuItemTranslations)
            .where(
              and(
                inArray(menuItemTranslations.itemId, itemIds),
                eq(menuItemTranslations.locale, locale),
              ),
            )
        : Promise.resolve([]),
      deps.db
        .select({ heroNote: menuTranslations.heroNote })
        .from(menuTranslations)
        .where(
          and(
            eq(menuTranslations.restaurantId, restaurantId),
            eq(menuTranslations.locale, locale),
          ),
        )
        .then((rows) => rows[0] ?? null),
    ]);

    // Step 3 — build lookup maps with per-row fallback on name.
    const sections = new Map<string, SectionTranslation>();
    for (const row of sectionTransRows) {
      const translatedName = pickTranslatedName(row.name);
      if (translatedName === null) continue; // per-row fallback: keep RO name
      const entry: SectionTranslation = { name: translatedName };
      if (row.intro?.trim()) entry.intro = row.intro;
      sections.set(row.sectionId, entry);
    }

    const items = new Map<string, ItemTranslation>();
    for (const row of itemTransRows) {
      const translatedName = pickTranslatedName(row.name);
      if (translatedName === null) continue; // per-row fallback: keep RO name
      const entry: ItemTranslation = { name: translatedName };
      if (row.description?.trim()) entry.description = row.description;
      items.set(row.itemId, entry);
    }

    // heroNote: only use if non-empty.
    const heroNote =
      menuTransRow?.heroNote?.trim() ? menuTransRow.heroNote : undefined;

    return { sections, items, heroNote };
  };
}

export const loadMenuTranslations = makeLoadMenuTranslations({ db: dbAdmin });

/**
 * Targeted loader: fetch translations for a specific set of item ids only.
 * Preferred over loadMenuTranslations when only a handful of items need
 * translation (e.g. chef picks on the detail page).
 *
 * Returns a Map<itemId, ItemTranslation> with per-row fallback:
 * items whose translated name is missing/empty are omitted from the map
 * (caller keeps the RO original).
 *
 * RO locale: returns an empty map immediately without DB calls.
 * Empty itemIds array: returns an empty map immediately without DB calls.
 */
export function makeLoadMenuItemTranslations(deps: Deps) {
  return async function loadMenuItemTranslations(
    itemIds: string[],
    locale: Locale,
  ): Promise<Map<string, ItemTranslation>> {
    if (locale === "ro" || itemIds.length === 0) {
      return new Map();
    }

    const rows = await deps.db
      .select()
      .from(menuItemTranslations)
      .where(
        and(
          inArray(menuItemTranslations.itemId, itemIds),
          eq(menuItemTranslations.locale, locale),
        ),
      );

    const result = new Map<string, ItemTranslation>();
    for (const row of rows) {
      const translatedName = pickTranslatedName(row.name);
      if (translatedName === null) continue; // per-row fallback
      const entry: ItemTranslation = { name: translatedName };
      if (row.description?.trim()) entry.description = row.description;
      result.set(row.itemId, entry);
    }
    return result;
  };
}

export const loadMenuItemTranslations = makeLoadMenuItemTranslations({ db: dbAdmin });
