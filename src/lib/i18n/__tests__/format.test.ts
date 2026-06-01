import {
  pluralCategory,
  formatDate,
  formatNumber,
  formatCurrency,
} from "@/lib/i18n/format";

describe("native Intl formatting", () => {
  it("returns correct Romanian plural categories (one/few/other)", () => {
    expect(pluralCategory("ro", 1)).toBe("one");
    expect(pluralCategory("ro", 2)).toBe("few");
    expect(pluralCategory("ro", 19)).toBe("few");
    expect(pluralCategory("ro", 20)).toBe("other");
    expect(pluralCategory("ro", 0)).toBe("few");
  });

  it("returns two-form plural categories for en/de", () => {
    expect(pluralCategory("en", 1)).toBe("one");
    expect(pluralCategory("en", 2)).toBe("other");
    expect(pluralCategory("de", 1)).toBe("one");
    expect(pluralCategory("de", 5)).toBe("other");
  });

  it("formats currency from cents in the locale, mapping lei→RON", () => {
    // Non-breaking spaces vary by ICU build; assert the parts we control.
    const ro = formatCurrency(5000, "lei", "ro");
    expect(ro).toMatch(/50/);
    expect(ro.toUpperCase()).toMatch(/RON|LEI/);

    const de = formatCurrency(5000, "EUR", "de");
    expect(de).toMatch(/50/);
    expect(de).toMatch(/€|EUR/);
  });

  it("formats numbers per locale grouping", () => {
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
    // de uses '.' grouping and ',' decimal
    expect(formatNumber(1234.5, "de")).toBe("1.234,5");
  });

  it("formats a date per locale without throwing", () => {
    const d = new Date(Date.UTC(2026, 8, 15)); // 2026-09-15
    expect(typeof formatDate(d, "ro")).toBe("string");
    expect(formatDate(d, "en")).toMatch(/2026/);
  });
});
