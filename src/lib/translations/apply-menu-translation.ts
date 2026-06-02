/**
 * Pure overlay helpers — map MenuTranslations lookup maps onto a Menu object.
 * No DB access; fully testable without a live database.
 *
 * Per-row fallback: if a section/item id is not present in the translations
 * map (translation missing or empty name), the original RO value is kept.
 */

import type { Menu, MenuSection, MenuItem } from "@/lib/types";
import type { MenuTranslations, ItemTranslation } from "./load-menu";

/**
 * Overlay translated name/description onto a chef-picks array from an item map.
 * Pure helper — no DB access, no side effects.
 *
 * For each item in chefPicks:
 *   - If itemMap has an entry for item.id: return a new item with translated
 *     name (and description, if authored).
 *   - Otherwise: return the original item unchanged (RO per-row fallback).
 *
 * Always returns a new array (does not mutate the input).
 * Pass an empty map (or omit) to get RO passthrough.
 */
export function applyChefPickTranslations(
  chefPicks: MenuItem[],
  itemMap: Map<string, ItemTranslation>,
): MenuItem[] {
  return chefPicks.map((item) => {
    const t = itemMap.get(item.id);
    if (!t) return item;
    return {
      ...item,
      name: t.name,
      ...(t.description !== undefined ? { description: t.description } : {}),
    };
  });
}

/**
 * Return a new Menu with translated section names/intros, item names/descriptions,
 * and menu-level heroNote overlaid where authored. All other fields are unchanged.
 *
 * Pass an empty MenuTranslations (empty maps, no heroNote) to get RO unchanged.
 */
export function applyMenuTranslations(
  menu: Menu,
  translations: MenuTranslations,
): Menu {
  const { sections: sectionMap, items: itemMap, heroNote } = translations;

  const localizedSections: MenuSection[] = menu.sections.map((section) => {
    const t = sectionMap.get(section.id);
    if (!t) return section;
    return {
      ...section,
      name: t.name,
      ...(t.intro !== undefined ? { intro: t.intro } : {}),
    };
  });

  const localizedItems: MenuItem[] = menu.items.map((item) => {
    const t = itemMap.get(item.id);
    if (!t) return item;
    return {
      ...item,
      name: t.name,
      ...(t.description !== undefined ? { description: t.description } : {}),
    };
  });

  return {
    ...menu,
    sections: localizedSections,
    items: localizedItems,
    ...(heroNote !== undefined ? { heroNote } : {}),
  };
}
