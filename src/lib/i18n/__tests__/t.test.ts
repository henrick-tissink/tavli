import { interpolate, translate } from "@/lib/i18n/t";

describe("interpolate", () => {
  it("substitutes named vars and leaves unknown placeholders intact", () => {
    expect(interpolate("Salut, {name}!", { name: "Ana" })).toBe("Salut, Ana!");
    expect(interpolate("no vars")).toBe("no vars");
    expect(interpolate("{missing}", {})).toBe("{missing}");
  });
});

describe("translate", () => {
  it("interpolates a plain string", () => {
    expect(translate("ro", "Rezervă o {what}", { what: "masă" })).toBe(
      "Rezervă o masă",
    );
  });

  it("selects the Romanian plural form by count", () => {
    const bag = { one: "{count} masă", few: "{count} mese", other: "{count} de mese" };
    expect(translate("ro", bag, { count: 1 })).toBe("1 masă");
    expect(translate("ro", bag, { count: 3 })).toBe("3 mese");
    expect(translate("ro", bag, { count: 20 })).toBe("20 de mese");
  });

  it("uses one/other for english", () => {
    const bag = { one: "{count} table", other: "{count} tables" };
    expect(translate("en", bag, { count: 1 })).toBe("1 table");
    expect(translate("en", bag, { count: 4 })).toBe("4 tables");
  });

  it("falls back to `other` then first form when a category is absent", () => {
    expect(translate("ro", { other: "mese" }, { count: 2 })).toBe("mese");
  });
});
