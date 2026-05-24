import { foldAcquisitionSource } from "@/lib/analytics/source-fold";

describe("foldAcquisitionSource", () => {
  test("1:1 mappings for the canonical sources", () => {
    expect(foldAcquisitionSource("widget")).toBe("source_widget");
    expect(foldAcquisitionSource("venue_page")).toBe("source_venue_page");
    expect(foldAcquisitionSource("editorial")).toBe("source_editorial");
    expect(foldAcquisitionSource("corporate")).toBe("source_corporate");
    expect(foldAcquisitionSource("walk_in")).toBe("source_walk_in");
    expect(foldAcquisitionSource("manual")).toBe("source_manual");
  });

  test("import + api fold into manual", () => {
    expect(foldAcquisitionSource("import")).toBe("source_manual");
    expect(foldAcquisitionSource("api")).toBe("source_manual");
  });

  test("email_campaign folds to unknown (marketing attribution is §11's)", () => {
    expect(foldAcquisitionSource("email_campaign")).toBe("source_unknown");
  });

  test("null / unrecognised / no-diner fold to unknown", () => {
    expect(foldAcquisitionSource(null)).toBe("source_unknown");
    expect(foldAcquisitionSource("something_new")).toBe("source_unknown");
  });
});
