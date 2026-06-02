/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));

// Mock schema objects
jest.mock("@/lib/db/schema", () => ({
  menuSections: { id: "id", restaurantId: "restaurant_id" },
  menuItems: { id: "id", restaurantId: "restaurant_id" },
  menuSectionTranslations: { sectionId: "section_id", locale: "locale", name: "name", intro: "intro" },
  menuItemTranslations: { itemId: "item_id", locale: "locale", name: "name", description: "description" },
  menuTranslations: { restaurantId: "restaurant_id", locale: "locale", heroNote: "hero_note" },
}));

jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));

jest.mock("drizzle-orm", () => ({
  and: jest.fn((...args) => ({ type: "and", args })),
  eq: jest.fn((col, val) => ({ type: "eq", col, val })),
  inArray: jest.fn((col, vals) => ({ type: "inArray", col, vals })),
}));

import { makeLoadMenuTranslations } from "../load-menu";

type AnyRow = Record<string, unknown>;

function makeSectionTransRow(sectionId: string, locale: string, overrides: Partial<AnyRow> = {}): AnyRow {
  return {
    sectionId,
    locale,
    name: `Section ${sectionId}`,
    intro: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeItemTransRow(itemId: string, locale: string, overrides: Partial<AnyRow> = {}): AnyRow {
  return {
    itemId,
    locale,
    name: `Item ${itemId}`,
    description: null,
    altText: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Build a mock db that returns given rows for each sequential select() call.
 * The calls for sections/items (id lookups) come first, then translations.
 */
function makeDb(callResults: unknown[][]) {
  let callIndex = 0;
  const makeChain = (idx: number) => ({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockImplementation(() => {
        // Some paths chain .then() for menuTranslations
        const result = Promise.resolve(callResults[idx] ?? []);
        (result as any).then = (fn: (v: unknown) => unknown) =>
          Promise.resolve(callResults[idx] ?? []).then(fn);
        return result;
      }),
    }),
  });

  return {
    select: jest.fn().mockImplementation(() => {
      return makeChain(callIndex++);
    }),
  };
}

describe("loadMenuTranslations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty maps for RO locale without DB calls", async () => {
    const db = { select: jest.fn() };
    const load = makeLoadMenuTranslations({ db: db as any });

    const result = await load("rest-1", "ro");

    expect(result.sections.size).toBe(0);
    expect(result.items.size).toBe(0);
    expect(result.heroNote).toBeUndefined();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns empty maps when restaurant has no sections/items", async () => {
    const db = makeDb([
      [], // sectionIds query → empty
      [], // itemIds query → empty
    ]);
    const load = makeLoadMenuTranslations({ db: db as any });

    const result = await load("rest-1", "en");

    expect(result.sections.size).toBe(0);
    expect(result.items.size).toBe(0);
  });

  it("builds section map with translated names", async () => {
    const db = makeDb([
      [{ id: "s1" }, { id: "s2" }],      // sectionIds
      [{ id: "i1" }],                      // itemIds
      [makeSectionTransRow("s1", "en", { name: "EN Starters", intro: "Our finest starters" }), makeSectionTransRow("s2", "en", { name: "EN Mains" })], // section translations
      [makeItemTransRow("i1", "en", { name: "EN Pasta" })],  // item translations
      [{ heroNote: null }],               // menu translation row
    ]);
    const load = makeLoadMenuTranslations({ db: db as any });

    const result = await load("rest-1", "en");

    expect(result.sections.get("s1")).toEqual({ name: "EN Starters", intro: "Our finest starters" });
    expect(result.sections.get("s2")).toEqual({ name: "EN Mains" });
    expect(result.items.get("i1")).toEqual({ name: "EN Pasta" });
  });

  it("per-row fallback: skips sections with empty translated name", async () => {
    const db = makeDb([
      [{ id: "s1" }, { id: "s2" }],
      [],
      [
        makeSectionTransRow("s1", "en", { name: "" }),   // empty name → skip
        makeSectionTransRow("s2", "en", { name: "EN Mains" }), // valid
      ],
      [], // items (none)
      [{ heroNote: null }],
    ]);
    const load = makeLoadMenuTranslations({ db: db as any });

    const result = await load("rest-1", "en");

    expect(result.sections.has("s1")).toBe(false); // per-row fallback → not in map
    expect(result.sections.get("s2")).toEqual({ name: "EN Mains" });
  });

  it("per-row fallback: skips items with null translated name", async () => {
    // No sections; sectionIds=[] → section-trans fetch is Promise.resolve([]), no DB call.
    // Call sequence: sectionIds(0), itemIds(1), itemTrans(2), menuTrans(3).
    const db = makeDb([
      [],                                                        // call 0: sectionIds query
      [{ id: "i1" }, { id: "i2" }],                            // call 1: itemIds query
      [                                                          // call 2: item translations (no sectionTrans call when sectionIds=[])
        makeItemTransRow("i1", "en", { name: null }),           // null → per-row skip
        makeItemTransRow("i2", "en", { name: "EN Item 2" }),    // valid
      ],
      [{ heroNote: null }],                                      // call 3: menu trans row
    ]);
    const load = makeLoadMenuTranslations({ db: db as any });

    const result = await load("rest-1", "en");

    expect(result.items.has("i1")).toBe(false);
    expect(result.items.get("i2")).toEqual({ name: "EN Item 2" });
  });

  it("includes heroNote when authored and non-empty", async () => {
    const db = makeDb([
      [{ id: "s1" }],
      [{ id: "i1" }],
      [makeSectionTransRow("s1", "en")],
      [makeItemTransRow("i1", "en")],
      [{ heroNote: "Welcome to our EN menu!" }],
    ]);
    const load = makeLoadMenuTranslations({ db: db as any });

    const result = await load("rest-1", "en");

    expect(result.heroNote).toBe("Welcome to our EN menu!");
  });

  it("does not include heroNote when null/empty", async () => {
    // No items; itemIds=[] → itemTrans fetch is Promise.resolve([]), no DB call.
    // Call sequence: sectionIds(0), itemIds(1), sectionTrans(2), menuTrans(3).
    const db = makeDb([
      [{ id: "s1" }],              // call 0: sectionIds
      [],                           // call 1: itemIds
      [makeSectionTransRow("s1", "en")],  // call 2: sectionTrans
      // itemTrans → Promise.resolve([]) (no DB call since itemIds=[])
      [{ heroNote: "" }],          // call 3: menuTrans
    ]);
    const load = makeLoadMenuTranslations({ db: db as any });

    const result = await load("rest-1", "en");

    expect(result.heroNote).toBeUndefined();
  });

  it("works for DE locale", async () => {
    const db = makeDb([
      [{ id: "s1" }],
      [{ id: "i1" }],
      [makeSectionTransRow("s1", "de", { name: "DE Starters" })],
      [makeItemTransRow("i1", "de", { name: "DE Pasta", description: "Frische Pasta" })],
      [{ heroNote: "DE hero" }],
    ]);
    const load = makeLoadMenuTranslations({ db: db as any });

    const result = await load("rest-1", "de");

    expect(result.sections.get("s1")).toEqual({ name: "DE Starters" });
    expect(result.items.get("i1")).toEqual({ name: "DE Pasta", description: "Frische Pasta" });
    expect(result.heroNote).toBe("DE hero");
  });
});
