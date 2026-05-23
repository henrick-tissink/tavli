/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));

import { priceIdForTierFrequency, priceIdForExtraLocation, priceIdForOverage } from "../price-ids";

const ENV_BACKUP = { ...process.env };
afterEach(() => {
  process.env = { ...ENV_BACKUP };
});

describe("price-id resolvers", () => {
  it("resolves (tier, frequency) from env", () => {
    process.env.STRIPE_PRICE_PRO_ANNUAL = "price_pro_annual_live";
    expect(priceIdForTierFrequency("pro", "annual")).toBe("price_pro_annual_live");
  });

  it("resolves extra-location price from env", () => {
    process.env.STRIPE_PRICE_EXTRA_LOCATION_MONTHLY = "price_extra_m";
    expect(priceIdForExtraLocation("monthly")).toBe("price_extra_m");
  });

  it("resolves overage price from env", () => {
    process.env.STRIPE_PRICE_SMS_OVERAGE = "price_sms";
    expect(priceIdForOverage("sms_overage")).toBe("price_sms");
  });

  it("throws a clear error when the env var is unset", () => {
    delete process.env.STRIPE_PRICE_BASE_MONTHLY;
    expect(() => priceIdForTierFrequency("base", "monthly")).toThrow(/STRIPE_PRICE_BASE_MONTHLY/);
  });
});
