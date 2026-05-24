import {
  loadPricingMessages,
  isLocale,
  LOCALES,
  DEFAULT_LOCALE,
} from "@/lib/i18n/load-messages";

describe("loadPricingMessages", () => {
  it("returns the catalogue for each supported locale", () => {
    expect(loadPricingMessages("ro").meta.title).toContain("Tavli");
    expect(loadPricingMessages("en").hero.titleAccent).toBe("One promise.");
    expect(loadPricingMessages("de").frequency.monthly).toBe("Monatlich");
  });

  it("falls back to RO for an unknown locale", () => {
    const fallback = loadPricingMessages("fr");
    expect(fallback).toBe(loadPricingMessages(DEFAULT_LOCALE));
    expect(fallback.hero.title).toBe("Două niveluri.");
  });

  it("keeps the six contractual promises verbatim in EN", () => {
    const { items } = loadPricingMessages("en").promises;
    expect(items).toHaveLength(6);
    expect(items[0].label).toBe("No per-cover fees, ever.");
    expect(items[5].body).toContain("Billing starts day 91.");
  });

  it("exposes six year-one rows keyed consistently across locales", () => {
    const keys = (l: string) => loadPricingMessages(l).yearOne.rows.map((r) => r.key);
    expect(keys("ro")).toEqual(keys("en"));
    expect(keys("en")).toEqual(keys("de"));
    expect(keys("ro")).toEqual([
      "base_monthly",
      "base_annual",
      "pro_monthly",
      "pro_annual",
      "pro5_monthly",
      "pro5_annual",
    ]);
  });

  it("marks only the fifth setup step as Pro-only in every locale", () => {
    for (const locale of LOCALES) {
      const steps = loadPricingMessages(locale).setup.steps;
      expect(steps).toHaveLength(5);
      expect(steps.filter((s) => s.proOnly)).toHaveLength(1);
      expect(steps[4].proOnly).toBe(true);
    }
  });

  it("isLocale narrows supported codes", () => {
    expect(isLocale("ro")).toBe(true);
    expect(isLocale("de")).toBe(true);
    expect(isLocale("es")).toBe(false);
  });
});
