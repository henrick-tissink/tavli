/**
 * Unit tests for applyMenuTranslations — pure function, no DB/server.
 */

import { applyMenuTranslations, applyChefPickTranslations } from "../apply-menu-translation";
import type { Menu, MenuItem } from "@/lib/types";
import type { MenuTranslations, ItemTranslation } from "../load-menu";

function makeMenu(overrides: Partial<Menu> = {}): Menu {
  return {
    restaurantId: "r1",
    currency: "lei",
    sections: [
      { id: "s1", name: "Aperitive" },
      { id: "s2", name: "Feluri principale", intro: "Bucatele noastre" },
    ],
    items: [
      { id: "i1", sectionId: "s1", name: "Sarmale", description: "Traditional", price: 35 },
      { id: "i2", sectionId: "s2", name: "Friptura", description: "", price: 65 },
    ],
    heroNote: "RO hero note",
    ...overrides,
  };
}

function makeTranslations(overrides: Partial<MenuTranslations> = {}): MenuTranslations {
  return {
    sections: new Map(),
    items: new Map(),
    ...overrides,
  };
}

describe("applyMenuTranslations", () => {
  it("returns menu unchanged when translations are empty (RO passthrough)", () => {
    const menu = makeMenu();
    const translations = makeTranslations();
    const result = applyMenuTranslations(menu, translations);
    expect(result.sections[0].name).toBe("Aperitive");
    expect(result.sections[1].name).toBe("Feluri principale");
    expect(result.items[0].name).toBe("Sarmale");
    expect(result.heroNote).toBe("RO hero note");
  });

  it("overlays section names from translations map", () => {
    const menu = makeMenu();
    const translations = makeTranslations({
      sections: new Map([
        ["s1", { name: "Starters" }],
        ["s2", { name: "Main Courses", intro: "Our signature dishes" }],
      ]),
    });
    const result = applyMenuTranslations(menu, translations);
    expect(result.sections[0].name).toBe("Starters");
    expect(result.sections[1].name).toBe("Main Courses");
    expect(result.sections[1].intro).toBe("Our signature dishes");
  });

  it("overlays item names and descriptions from translations map", () => {
    const menu = makeMenu();
    const translations = makeTranslations({
      items: new Map([
        ["i1", { name: "Stuffed Cabbage", description: "Traditional Romanian" }],
        ["i2", { name: "Steak" }],
      ]),
    });
    const result = applyMenuTranslations(menu, translations);
    expect(result.items[0].name).toBe("Stuffed Cabbage");
    expect(result.items[0].description).toBe("Traditional Romanian");
    expect(result.items[1].name).toBe("Steak");
  });

  it("per-row fallback: sections not in translation map keep RO name", () => {
    const menu = makeMenu();
    const translations = makeTranslations({
      sections: new Map([["s1", { name: "Starters" }]]), // only s1 translated
    });
    const result = applyMenuTranslations(menu, translations);
    expect(result.sections[0].name).toBe("Starters"); // translated
    expect(result.sections[1].name).toBe("Feluri principale"); // RO fallback
  });

  it("per-row fallback: items not in translation map keep RO name", () => {
    const menu = makeMenu();
    const translations = makeTranslations({
      items: new Map([["i1", { name: "Stuffed Cabbage" }]]), // only i1 translated
    });
    const result = applyMenuTranslations(menu, translations);
    expect(result.items[0].name).toBe("Stuffed Cabbage"); // translated
    expect(result.items[1].name).toBe("Friptura"); // RO fallback
  });

  it("overlays heroNote when present in translations", () => {
    const menu = makeMenu({ heroNote: "RO hero" });
    const translations = makeTranslations({ heroNote: "EN hero note" });
    const result = applyMenuTranslations(menu, translations);
    expect(result.heroNote).toBe("EN hero note");
  });

  it("keeps RO heroNote when translations.heroNote is undefined", () => {
    const menu = makeMenu({ heroNote: "RO hero" });
    const translations = makeTranslations({ heroNote: undefined });
    const result = applyMenuTranslations(menu, translations);
    expect(result.heroNote).toBe("RO hero");
  });

  it("does not overlay section intro if not provided in translation", () => {
    const menu = makeMenu();
    // s2 has intro in RO; EN translation only has name, no intro
    const translations = makeTranslations({
      sections: new Map([["s2", { name: "Main Courses" }]]),
    });
    const result = applyMenuTranslations(menu, translations);
    // intro from original preserved
    expect(result.sections[1].intro).toBe("Bucatele noastre");
  });

  it("returns new menu object (does not mutate original)", () => {
    const menu = makeMenu();
    const translations = makeTranslations({
      sections: new Map([["s1", { name: "Starters" }]]),
    });
    const result = applyMenuTranslations(menu, translations);
    expect(result).not.toBe(menu);
    expect(menu.sections[0].name).toBe("Aperitive"); // original unchanged
  });

  it("preserves other menu fields (currency, restaurantId)", () => {
    const menu = makeMenu({ currency: "EUR" });
    const translations = makeTranslations({
      sections: new Map([["s1", { name: "Starters" }]]),
    });
    const result = applyMenuTranslations(menu, translations);
    expect(result.currency).toBe("EUR");
    expect(result.restaurantId).toBe("r1");
  });

  it("preserves item tags and price (non-translated fields)", () => {
    const menu = makeMenu({
      items: [
        { id: "i1", sectionId: "s1", name: "Sarmale", description: "Traditional", price: 35, tags: ["chef-pick"] },
      ],
    });
    const translations = makeTranslations({
      items: new Map([["i1", { name: "Stuffed Cabbage" }]]),
    });
    const result = applyMenuTranslations(menu, translations);
    expect(result.items[0].tags).toEqual(["chef-pick"]);
    expect(result.items[0].price).toBe(35);
  });
});

// ─── applyChefPickTranslations ────────────────────────────────────────────────

function makeChefPick(id: string, overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id,
    sectionId: "s1",
    name: `RO Name ${id}`,
    description: `RO Desc ${id}`,
    price: 50,
    ...overrides,
  };
}

describe("applyChefPickTranslations", () => {
  it("RO passthrough: returns all items unchanged when map is empty", () => {
    const picks = [makeChefPick("i1"), makeChefPick("i2")];
    const result = applyChefPickTranslations(picks, new Map());
    expect(result[0].name).toBe("RO Name i1");
    expect(result[1].name).toBe("RO Name i2");
  });

  it("RO passthrough: returns all items unchanged when map is undefined-equivalent (no entries)", () => {
    const picks = [makeChefPick("i1")];
    const result = applyChefPickTranslations(picks, new Map<string, ItemTranslation>());
    expect(result[0].name).toBe("RO Name i1");
  });

  it("overlays name and description for EN locale by id", () => {
    const picks = [makeChefPick("i1"), makeChefPick("i2")];
    const map = new Map<string, ItemTranslation>([
      ["i1", { name: "Stuffed Cabbage", description: "Traditional Romanian" }],
      ["i2", { name: "Grilled Steak" }],
    ]);
    const result = applyChefPickTranslations(picks, map);
    expect(result[0].name).toBe("Stuffed Cabbage");
    expect(result[0].description).toBe("Traditional Romanian");
    expect(result[1].name).toBe("Grilled Steak");
    // i2 has no description in map → keeps original
    expect(result[1].description).toBe("RO Desc i2");
  });

  it("per-row fallback: item not in map keeps RO name/description", () => {
    const picks = [makeChefPick("i1"), makeChefPick("i2")];
    const map = new Map<string, ItemTranslation>([
      ["i1", { name: "Stuffed Cabbage" }],
      // i2 not present → RO fallback
    ]);
    const result = applyChefPickTranslations(picks, map);
    expect(result[0].name).toBe("Stuffed Cabbage");
    expect(result[1].name).toBe("RO Name i2");
    expect(result[1].description).toBe("RO Desc i2");
  });

  it("immutability: does not mutate original chefPicks array or items", () => {
    const picks = [makeChefPick("i1")];
    const originalName = picks[0].name;
    const map = new Map<string, ItemTranslation>([
      ["i1", { name: "EN Name" }],
    ]);
    const result = applyChefPickTranslations(picks, map);
    // original array unchanged
    expect(picks[0].name).toBe(originalName);
    // returned array is a new reference
    expect(result).not.toBe(picks);
    expect(result[0]).not.toBe(picks[0]);
  });

  it("preserves non-translated fields (price, tags, photoUrl, sectionId)", () => {
    const picks = [makeChefPick("i1", { price: 99, tags: ["chef-pick", "spicy"], photoUrl: "http://x.com/img.jpg" })];
    const map = new Map<string, ItemTranslation>([
      ["i1", { name: "EN Name", description: "EN Desc" }],
    ]);
    const result = applyChefPickTranslations(picks, map);
    expect(result[0].price).toBe(99);
    expect(result[0].tags).toEqual(["chef-pick", "spicy"]);
    expect(result[0].photoUrl).toBe("http://x.com/img.jpg");
    expect(result[0].sectionId).toBe("s1");
  });

  it("handles empty chefPicks array", () => {
    const result = applyChefPickTranslations([], new Map());
    expect(result).toEqual([]);
  });

  it("DE locale: overlays from a DE item map", () => {
    const picks = [makeChefPick("i1", { name: "Mămăligă", description: "Porridge RO" })];
    const map = new Map<string, ItemTranslation>([
      ["i1", { name: "Polenta", description: "Traditionelle rumänische Polenta" }],
    ]);
    const result = applyChefPickTranslations(picks, map);
    expect(result[0].name).toBe("Polenta");
    expect(result[0].description).toBe("Traditionelle rumänische Polenta");
  });
});
