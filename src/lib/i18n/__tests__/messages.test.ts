import { getMessages, buildBundle, NAMESPACES } from "@/lib/i18n/messages";

describe("getMessages", () => {
  it("returns the requested namespace in the requested locale", () => {
    expect(getMessages("en", "common").switchLanguage).toBe("Change language");
    expect(getMessages("de", "common").switchLanguage).toBe("Sprache ändern");
    expect(getMessages("ro", "common").cities.bucuresti).toBe("București");
  });

  it("falls back to RO for an unknown locale", () => {
    expect(getMessages("fr", "common").switchLanguage).toBe("Schimbă limba");
  });

  it("builds a bundle with the requested namespaces", () => {
    const enBundle = buildBundle("en", ["common"]);
    expect(enBundle).toHaveProperty("common");
    expect((enBundle.common as { switchLanguage: string }).switchLanguage).toBe("Change language");

    const deBundle = buildBundle("de", ["common"]);
    expect(deBundle).toHaveProperty("common");
    expect((deBundle.common as { switchLanguage: string }).switchLanguage).toBe("Sprache ändern");
  });

  it("has identical key sets across all locales for every namespace", () => {
    const keysOf = (o: unknown): string[] => {
      const acc: string[] = [];
      const walk = (v: unknown, prefix: string) => {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          for (const k of Object.keys(v as Record<string, unknown>)) {
            acc.push(prefix + k);
            walk((v as Record<string, unknown>)[k], prefix + k + ".");
          }
        }
      };
      walk(o, "");
      return acc.sort();
    };
    for (const ns of NAMESPACES) {
      const ro = keysOf(getMessages("ro", ns));
      const en = keysOf(getMessages("en", ns));
      const de = keysOf(getMessages("de", ns));
      expect(en).toEqual(ro);
      expect(de).toEqual(ro);
    }
  });
});
