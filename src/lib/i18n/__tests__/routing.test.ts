import { localeFromPathname, decideLocaleAction, withLocale, localizedHref } from "@/lib/i18n/routing";

describe("localeFromPathname", () => {
  it("extracts an explicit locale prefix", () => {
    expect(localeFromPathname("/en/bucuresti")).toEqual({ locale: "en", hasPrefix: true });
    expect(localeFromPathname("/de")).toEqual({ locale: "de", hasPrefix: true });
  });
  it("treats an unprefixed path as RO without a prefix", () => {
    expect(localeFromPathname("/bucuresti/casa-veche")).toEqual({ locale: "ro", hasPrefix: false });
    expect(localeFromPathname("/")).toEqual({ locale: "ro", hasPrefix: false });
  });
});

describe("decideLocaleAction", () => {
  it("passes through an already-prefixed path untouched", () => {
    expect(
      decideLocaleAction({ pathname: "/en/bucuresti", cookieLocale: null, accept: "ro" }),
    ).toEqual({ type: "next", to: undefined, setCookie: undefined });
  });

  it("rewrites unprefixed path to RO internal when cookieLocale is 'ro'", () => {
    expect(
      decideLocaleAction({ pathname: "/bucuresti", cookieLocale: "ro", accept: "en" }),
    ).toEqual({ type: "rewrite", to: "/ro/bucuresti", setCookie: undefined });
  });

  it("redirects to /en/... when cookieLocale is 'en' (honors preference)", () => {
    expect(
      decideLocaleAction({ pathname: "/bucuresti", cookieLocale: "en", accept: "ro" }),
    ).toEqual({ type: "redirect", to: "/en/bucuresti", setCookie: undefined });
  });

  it("redirects an unprefixed first-visit to a non-RO detected locale (no cookie)", () => {
    expect(
      decideLocaleAction({ pathname: "/bucuresti", cookieLocale: null, accept: "de-DE,de;q=0.9" }),
    ).toEqual({ type: "redirect", to: "/de/bucuresti", setCookie: "de" });
  });

  it("rewrites + sets cookie when first-visit detects RO (no cookie)", () => {
    expect(
      decideLocaleAction({ pathname: "/bucuresti", cookieLocale: null, accept: "ro-RO" }),
    ).toEqual({ type: "rewrite", to: "/ro/bucuresti", setCookie: "ro" });
  });

  it("treats an invalid cookie value as no cookie and falls back to Accept-Language", () => {
    expect(
      decideLocaleAction({ pathname: "/bucuresti", cookieLocale: "fr", accept: "en" }),
    ).toEqual({ type: "redirect", to: "/en/bucuresti", setCookie: "en" });
  });

  it("handles the bare root with cookieLocale 'ro'", () => {
    expect(
      decideLocaleAction({ pathname: "/", cookieLocale: "ro", accept: "en" }),
    ).toEqual({ type: "rewrite", to: "/ro", setCookie: undefined });
  });
});

describe("withLocale", () => {
  it("adds/strips the prefix correctly", () => {
    expect(withLocale("/en/bucuresti", "ro")).toBe("/bucuresti");
    expect(withLocale("/bucuresti", "de")).toBe("/de/bucuresti");
    expect(withLocale("/en", "ro")).toBe("/");
    expect(withLocale("/", "en")).toBe("/en");
  });
});

describe("localizedHref", () => {
  it("returns the path unchanged for the default locale (ro)", () => {
    expect(localizedHref("/bucuresti/x", "ro")).toBe("/bucuresti/x");
  });

  it("prepends /<locale> for non-default locales", () => {
    expect(localizedHref("/bucuresti/x", "de")).toBe("/de/bucuresti/x");
    expect(localizedHref("/bucuresti/x", "en")).toBe("/en/bucuresti/x");
  });
});
