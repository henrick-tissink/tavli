/**
 * Pure overlay helpers — map MenuTranslations lookup maps onto a Menu object.
 * No DB access; fully testable without a live database.
 *
 * Per-row fallback: if a section/item id is not present in the translations
 * map (translation missing or empty name), the original RO value is kept.
 */

import type { Menu, MenuSection, MenuItem } from "@/lib/types";
import type { MenuTranslations } from "./load-menu";

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
