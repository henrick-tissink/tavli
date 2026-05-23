/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));

import { TAVLI_PRICE_SPECS, assertExclusiveTaxBehavior } from "../stripe-price-spec";

describe("TAVLI_PRICE_SPECS", () => {
  it("declares all 8 prices, all EUR, all tax_behavior 'exclusive'", () => {
    expect(TAVLI_PRICE_SPECS).toHaveLength(8);
    for (const p of TAVLI_PRICE_SPECS) {
      expect(p.currency).toBe("eur");
      expect(p.tax_behavior).toBe("exclusive");
      expect(p.unit_amount).toBeGreaterThan(0);
    }
  });

  it("annual prices are 10x the monthly counterpart (2 months free)", () => {
    const baseM = TAVLI_PRICE_SPECS.find((p) => p.key === "base_monthly")!;
    const baseA = TAVLI_PRICE_SPECS.find((p) => p.key === "base_annual")!;
    expect(baseA.unit_amount).toBe(baseM.unit_amount * 10);
  });
});

describe("assertExclusiveTaxBehavior", () => {
  it("passes when every fetched price is exclusive", () => {
    expect(() =>
      assertExclusiveTaxBehavior([
        { id: "price_1", tax_behavior: "exclusive" },
        { id: "price_2", tax_behavior: "exclusive" },
      ]),
    ).not.toThrow();
  });

  it("throws naming the offending price when any is not exclusive", () => {
    expect(() =>
      assertExclusiveTaxBehavior([
        { id: "price_1", tax_behavior: "exclusive" },
        { id: "price_bad", tax_behavior: "inclusive" },
      ]),
    ).toThrow(/price_bad/);
  });
});
