/**
 * @jest-environment node
 */

describe("getStripe", () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY = originalKey;
    }
    jest.resetModules();
  });

  it("throws a clear error when STRIPE_SECRET_KEY is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    jest.resetModules();
    const { getStripe } = await import("../client");
    expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY missing/);
  });

  it("constructs a singleton when STRIPE_SECRET_KEY is present", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy_for_construction_only";
    jest.resetModules();
    const { getStripe } = await import("../client");
    const a = getStripe();
    const b = getStripe();
    expect(a).toBe(b);
  });
});
