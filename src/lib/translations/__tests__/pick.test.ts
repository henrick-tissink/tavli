/**
 * @jest-environment node
 */

import { pickTranslationRow, type TranslationLike } from "../pick";

function row(overrides: Partial<TranslationLike> = {}): TranslationLike {
  return {
    name: "Restaurant Name",
    tagline: "A tagline",
    descriptionShort: "Short description",
    ...overrides,
  };
}

describe("pickTranslationRow", () => {
  it("returns the requested row when all required fields are present", () => {
    const ro = row({ name: "Nume RO", tagline: "Tagline RO", descriptionShort: "Desc RO" });
    const en = row({ name: "EN Name", tagline: "EN Tagline", descriptionShort: "EN Desc" });
    const result = pickTranslationRow({ requested: en, ro });
    expect(result.row).toBe(en);
    expect(result.usedFallback).toBe(false);
  });

  it("falls back to RO when requested row has null name", () => {
    const ro = row({ name: "Nume RO" });
    const en = row({ name: null });
    const result = pickTranslationRow({ requested: en, ro });
    expect(result.row).toBe(ro);
    expect(result.usedFallback).toBe(true);
  });

  it("falls back to RO when requested row has empty string name", () => {
    const ro = row({ name: "Nume RO" });
    const en = row({ name: "" });
    const result = pickTranslationRow({ requested: en, ro });
    expect(result.row).toBe(ro);
    expect(result.usedFallback).toBe(true);
  });

  it("falls back to RO when requested row has null tagline", () => {
    const ro = row({ tagline: "Tagline RO" });
    const en = row({ tagline: null });
    const result = pickTranslationRow({ requested: en, ro });
    expect(result.row).toBe(ro);
    expect(result.usedFallback).toBe(true);
  });

  it("falls back to RO when requested row has empty string tagline", () => {
    const ro = row({ tagline: "Tagline RO" });
    const en = row({ tagline: "" });
    const result = pickTranslationRow({ requested: en, ro });
    expect(result.row).toBe(ro);
    expect(result.usedFallback).toBe(true);
  });

  it("falls back to RO when requested row has null descriptionShort", () => {
    const ro = row({ descriptionShort: "Desc RO" });
    const en = row({ descriptionShort: null });
    const result = pickTranslationRow({ requested: en, ro });
    expect(result.row).toBe(ro);
    expect(result.usedFallback).toBe(true);
  });

  it("falls back to RO when requested row is null", () => {
    const ro = row();
    const result = pickTranslationRow({ requested: null, ro });
    expect(result.row).toBe(ro);
    expect(result.usedFallback).toBe(true);
  });

  it("returns RO row with usedFallback false when locale is 'ro' (caller passes ro as both)", () => {
    // When locale='ro', caller passes ro as both requested and ro.
    // pickTranslationRow is agnostic — it sees a fully complete row and returns it.
    const ro = row();
    const result = pickTranslationRow({ requested: ro, ro });
    expect(result.row).toBe(ro);
    expect(result.usedFallback).toBe(false);
  });
});
