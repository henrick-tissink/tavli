import { buildAlternates } from "@/lib/i18n/hreflang";

describe("buildAlternates", () => {
  it("emits canonical + ro/en/de + x-default for a localized path", () => {
    const alt = buildAlternates("/pricing", "en", "https://tavli.ro");
    expect(alt.canonical).toBe("https://tavli.ro/en/pricing");
    expect(alt.languages).toEqual({
      ro: "https://tavli.ro/pricing",
      en: "https://tavli.ro/en/pricing",
      de: "https://tavli.ro/de/pricing",
      "x-default": "https://tavli.ro/pricing",
    });
  });

  it("treats the RO canonical as unprefixed", () => {
    const alt = buildAlternates("/pricing", "ro", "https://tavli.ro");
    expect(alt.canonical).toBe("https://tavli.ro/pricing");
  });
});
