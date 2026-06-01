import {
  isLocale,
  LOCALES,
  DEFAULT_LOCALE,
  BCP47,
  toIsoCurrency,
  matchLocale,
} from "@/lib/i18n/locale";

describe("locale core", () => {
  it("recognizes supported locales and rejects others", () => {
    expect(LOCALES).toEqual(["ro", "en", "de"]);
    expect(DEFAULT_LOCALE).toBe("ro");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("maps each locale to a BCP-47 tag", () => {
    expect(BCP47).toEqual({ ro: "ro-RO", en: "en-GB", de: "de-DE" });
  });

  it("maps currency labels to ISO 4217", () => {
    expect(toIsoCurrency("lei")).toBe("RON");
    expect(toIsoCurrency("EUR")).toBe("EUR");
    expect(toIsoCurrency("TRY")).toBe("TRY");
  });

  it("picks the best Accept-Language match, defaulting to RO", () => {
    expect(matchLocale("de-DE,de;q=0.9,en;q=0.5")).toBe("de");
    expect(matchLocale("en-US,en;q=0.9")).toBe("en");
    expect(matchLocale("fr-FR,fr;q=0.9")).toBe("ro");
    expect(matchLocale(null)).toBe("ro");
    expect(matchLocale("")).toBe("ro");
  });

  it("respects q-value ordering over header order", () => {
    expect(matchLocale("en;q=0.3, de;q=0.9")).toBe("de");
  });

  it("treats a malformed q-value (NaN) as lowest priority", () => {
    // "de;q=abc" parses to NaN → falls back to 0, so "en;q=0.5" wins
    expect(matchLocale("de;q=abc, en;q=0.5")).toBe("en");
  });
});
