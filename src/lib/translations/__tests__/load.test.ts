/**
 * @jest-environment node
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({
  restaurantTranslations: { restaurantId: {}, locale: {} },
}));
jest.mock("drizzle-orm", () => ({
  and: jest.fn((...args) => ({ type: "and", args })),
  eq: jest.fn((col, val) => ({ type: "eq", col, val })),
  inArray: jest.fn((col, vals) => ({ type: "inArray", col, vals })),
}));

import { makeLoadRestaurantTranslation } from "../load";

type AnyRow = Record<string, unknown>;

function makeRow(locale: string, overrides: Partial<AnyRow> = {}): AnyRow {
  return {
    restaurantId: "rest-1",
    locale,
    name: "Name",
    tagline: "Tagline",
    descriptionShort: "Short desc",
    descriptionLong: null,
    heroSubtitle: null,
    chefBio: null,
    ambience: null,
    dressCode: null,
    parkingNote: null,
    metaTitle: null,
    metaDescription: null,
    ogTitle: null,
    ogDescription: null,
    authoredByUserId: null,
    reviewedByUserId: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDb(rows: AnyRow[]) {
  return {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

describe("loadRestaurantTranslation", () => {
  it("fetches only 'ro' locale when locale='ro'", async () => {
    const roRow = makeRow("ro");
    const db = makeDb([roRow]);
    const load = makeLoadRestaurantTranslation({ db: db as any });

    const { row, usedFallback } = await load("rest-1", "ro");

    expect(row).toEqual(roRow);
    expect(usedFallback).toBe(false);

    const { inArray } = require("drizzle-orm");
    expect(inArray).toHaveBeenCalledWith(expect.anything(), ["ro"]);
  });

  it("returns null with usedFallback=false when locale='ro' and no RO row", async () => {
    const db = makeDb([]);
    const load = makeLoadRestaurantTranslation({ db: db as any });

    const { row, usedFallback } = await load("rest-1", "ro");

    expect(row).toBeNull();
    expect(usedFallback).toBe(false);
  });

  it("fetches both 'ro' and 'en' when locale='en'", async () => {
    const roRow = makeRow("ro");
    const enRow = makeRow("en");
    const db = makeDb([roRow, enRow]);
    const load = makeLoadRestaurantTranslation({ db: db as any });

    const { inArray } = require("drizzle-orm");
    inArray.mockClear();

    await load("rest-1", "en");

    expect(inArray).toHaveBeenCalledWith(expect.anything(), ["ro", "en"]);
  });

  it("returns the EN row when EN row is complete", async () => {
    const roRow = makeRow("ro", { name: "RO Name", tagline: "RO Tagline", descriptionShort: "RO Desc" });
    const enRow = makeRow("en", { name: "EN Name", tagline: "EN Tagline", descriptionShort: "EN Desc" });
    const db = makeDb([roRow, enRow]);
    const load = makeLoadRestaurantTranslation({ db: db as any });

    const { row, usedFallback } = await load("rest-1", "en");

    expect(row).toEqual(enRow);
    expect(usedFallback).toBe(false);
  });

  it("falls back to RO when EN row is missing", async () => {
    const roRow = makeRow("ro");
    const db = makeDb([roRow]);
    const load = makeLoadRestaurantTranslation({ db: db as any });

    const { row, usedFallback } = await load("rest-1", "en");

    expect(row).toEqual(roRow);
    expect(usedFallback).toBe(true);
  });

  it("falls back to RO when EN row has null tagline", async () => {
    const roRow = makeRow("ro", { name: "RO Name", tagline: "RO Tag", descriptionShort: "RO Desc" });
    const enRow = makeRow("en", { name: "EN Name", tagline: null, descriptionShort: "EN Desc" });
    const db = makeDb([roRow, enRow]);
    const load = makeLoadRestaurantTranslation({ db: db as any });

    const { row, usedFallback } = await load("rest-1", "en");

    expect(row).toEqual(roRow);
    expect(usedFallback).toBe(true);
  });

  it("returns requested as-is (usedFallback=false) when no RO row exists", async () => {
    const enRow = makeRow("en");
    const db = makeDb([enRow]);
    const load = makeLoadRestaurantTranslation({ db: db as any });

    const { row, usedFallback } = await load("rest-1", "en");

    expect(row).toEqual(enRow);
    expect(usedFallback).toBe(false);
  });

  it("returns null with usedFallback=false when no rows exist at all", async () => {
    const db = makeDb([]);
    const load = makeLoadRestaurantTranslation({ db: db as any });

    const { row, usedFallback } = await load("rest-1", "en");

    expect(row).toBeNull();
    expect(usedFallback).toBe(false);
  });

  it("works for 'de' locale, fetching ['ro', 'de']", async () => {
    const roRow = makeRow("ro");
    const deRow = makeRow("de", { name: "DE Name", tagline: "DE Tag", descriptionShort: "DE Desc" });
    const db = makeDb([roRow, deRow]);
    const load = makeLoadRestaurantTranslation({ db: db as any });

    const { inArray } = require("drizzle-orm");
    inArray.mockClear();

    const { row, usedFallback } = await load("rest-1", "de");

    expect(inArray).toHaveBeenCalledWith(expect.anything(), ["ro", "de"]);
    expect(row).toEqual(deRow);
    expect(usedFallback).toBe(false);
  });
});
