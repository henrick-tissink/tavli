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

import { makeLoadMenuTranslations, makeLoadMenuItemTranslations } from "../load-menu";

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

  it("returns empty maps without querying the DB when enabled() is false (mock mode)", async () => {
    const db = makeDb([[{ id: "s1" }], [{ id: "i1" }]]);
    const load = makeLoadMenuTranslations({ db: db as any, enabled: () => false });

    const result = await load("5", "en");

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

// ─── makeLoadMenuItemTranslations ────────────────────────────────────────────

/**
 * Build a minimal mock db for the targeted item-translation loader.
 * The loader issues a single select().from().where() call, so we just need
 * one result array.
 */
function makeSingleSelectDb(rows: unknown[]) {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

describe("makeLoadMenuItemTranslations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty map for RO locale without DB calls", async () => {
    const db = { select: jest.fn() };
    const load = makeLoadMenuItemTranslations({ db: db as any });

    const result = await load(["i1", "i2"], "ro");

    expect(result.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns empty map for empty itemIds without DB calls", async () => {
    const db = { select: jest.fn() };
    const load = makeLoadMenuItemTranslations({ db: db as any });

    const result = await load([], "en");

    expect(result.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns empty map without querying the DB when enabled() is false (mock mode)", async () => {
    const db = makeDb([[makeItemTransRow("i1", "en")]]);
    const load = makeLoadMenuItemTranslations({ db: db as any, enabled: () => false });

    const result = await load(["5", "6"], "en");

    expect(result.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("builds item map with translated names for EN locale", async () => {
    const db = makeSingleSelectDb([
      makeItemTransRow("i1", "en", { name: "Stuffed Cabbage", description: "Traditional Romanian" }),
      makeItemTransRow("i2", "en", { name: "Grilled Steak" }),
    ]);
    const load = makeLoadMenuItemTranslations({ db: db as any });

    const result = await load(["i1", "i2"], "en");

    expect(result.get("i1")).toEqual({ name: "Stuffed Cabbage", description: "Traditional Romanian" });
    expect(result.get("i2")).toEqual({ name: "Grilled Steak" });
    expect(result.size).toBe(2);
  });

  it("per-row fallback: items with empty translated name are omitted from map", async () => {
    const db = makeSingleSelectDb([
      makeItemTransRow("i1", "en", { name: "" }),      // empty → skip (RO fallback)
      makeItemTransRow("i2", "en", { name: "Steak" }), // valid
    ]);
    const load = makeLoadMenuItemTranslations({ db: db as any });

    const result = await load(["i1", "i2"], "en");

    expect(result.has("i1")).toBe(false);
    expect(result.get("i2")).toEqual({ name: "Steak" });
  });

  it("per-row fallback: items with null translated name are omitted from map", async () => {
    const db = makeSingleSelectDb([
      makeItemTransRow("i1", "en", { name: null }), // null → skip
      makeItemTransRow("i2", "en", { name: "Pasta" }),
    ]);
    const load = makeLoadMenuItemTranslations({ db: db as any });

    const result = await load(["i1", "i2"], "en");

    expect(result.has("i1")).toBe(false);
    expect(result.get("i2")).toEqual({ name: "Pasta" });
  });

  it("omits description from entry when not authored (empty/null)", async () => {
    const db = makeSingleSelectDb([
      makeItemTransRow("i1", "en", { name: "Stuffed Cabbage", description: null }),
    ]);
    const load = makeLoadMenuItemTranslations({ db: db as any });

    const result = await load(["i1"], "en");

    expect(result.get("i1")).toEqual({ name: "Stuffed Cabbage" });
    expect(result.get("i1")?.description).toBeUndefined();
  });

  it("works for DE locale", async () => {
    const db = makeSingleSelectDb([
      makeItemTransRow("i1", "de", { name: "Polenta", description: "Traditionelle Polenta" }),
    ]);
    const load = makeLoadMenuItemTranslations({ db: db as any });

    const result = await load(["i1"], "de");

    expect(result.get("i1")).toEqual({ name: "Polenta", description: "Traditionelle Polenta" });
  });
});
