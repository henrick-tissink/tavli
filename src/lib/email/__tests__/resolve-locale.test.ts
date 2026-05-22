/**
 * @jest-environment node
 */

import { resolveDinerLocale } from "../resolve-locale";

describe("resolveDinerLocale", () => {
  test("returns diner locale when set", () => {
    expect(
      resolveDinerLocale({
        diner: { locale: "de" },
        reservation: { locale: "en" },
        restaurant: { locale: "ro" },
      }),
    ).toBe("de");
  });

  test("falls back to reservation locale when diner unset", () => {
    expect(
      resolveDinerLocale({
        diner: { locale: null },
        reservation: { locale: "en" },
        restaurant: { locale: "ro" },
      }),
    ).toBe("en");
  });

  test("falls back to restaurant locale when diner+reservation unset", () => {
    expect(
      resolveDinerLocale({
        diner: { locale: null },
        reservation: { locale: null },
        restaurant: { locale: "de" },
      }),
    ).toBe("de");
  });

  test("falls back to 'ro' when restaurant locale is unsupported", () => {
    expect(
      resolveDinerLocale({
        restaurant: { locale: "fr" },
      }),
    ).toBe("ro");
  });

  test("skips invalid diner locale", () => {
    expect(
      resolveDinerLocale({
        diner: { locale: "fr" },
        restaurant: { locale: "en" },
      }),
    ).toBe("en");
  });

  test("skips null/undefined sources", () => {
    expect(
      resolveDinerLocale({
        diner: { locale: undefined },
        reservation: { locale: null },
        restaurant: { locale: "ro" },
      }),
    ).toBe("ro");
  });

  test("handles missing diner + reservation entries entirely", () => {
    expect(resolveDinerLocale({ restaurant: { locale: "ro" } })).toBe("ro");
  });

  test("empty restaurant locale falls back to 'ro'", () => {
    expect(resolveDinerLocale({ restaurant: { locale: "" } })).toBe("ro");
  });
});
