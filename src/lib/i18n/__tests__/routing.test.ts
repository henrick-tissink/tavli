import { localeFromPathname, decideLocaleAction } from "@/lib/i18n/routing";

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
  it("rewrites unprefixed paths to the RO internal segment when cookie/RO", () => {
    expect(
      decideLocaleAction({ pathname: "/bucuresti", hasCookie: true, accept: "en" }),
    ).toEqual({ type: "rewrite", to: "/ro/bucuresti", setCookie: undefined });
  });

  it("redirects an unprefixed first-visit to a non-RO detected locale", () => {
    expect(
      decideLocaleAction({ pathname: "/bucuresti", hasCookie: false, accept: "de-DE,de;q=0.9" }),
    ).toEqual({ type: "redirect", to: "/de/bucuresti", setCookie: "de" });
  });

  it("rewrites + sets cookie when first-visit detects RO", () => {
    expect(
      decideLocaleAction({ pathname: "/bucuresti", hasCookie: false, accept: "ro-RO" }),
    ).toEqual({ type: "rewrite", to: "/ro/bucuresti", setCookie: "ro" });
  });

  it("passes through an already-prefixed path untouched", () => {
    expect(
      decideLocaleAction({ pathname: "/en/bucuresti", hasCookie: false, accept: "ro" }),
    ).toEqual({ type: "next", to: undefined, setCookie: undefined });
  });

  it("handles the bare root", () => {
    expect(
      decideLocaleAction({ pathname: "/", hasCookie: true, accept: "en" }),
    ).toEqual({ type: "rewrite", to: "/ro", setCookie: undefined });
  });
});
