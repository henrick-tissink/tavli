/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ subscriptions: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn() }));
jest.mock("@/lib/stripe/client", () => ({ getStripe: jest.fn() }));

import { makeStripeOverageReporter } from "../overage-reporter";

describe("makeStripeOverageReporter", () => {
  it("adds a EUR invoice item for the computed overage when the org has a Stripe customer", async () => {
    const create = jest.fn(async () => ({ id: "ii_1" }));
    const report = makeStripeOverageReporter({
      stripe: { invoiceItems: { create } } as never,
      getCustomerId: async () => "cus_123",
    });
    await report({ organizationId: "org-1", yearMonth: "2026-04", totalCents: 540 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_123", amount: 540, currency: "eur" }),
      // idempotency key keyed on (org, month) → a retry can't double-bill.
      expect.objectContaining({ idempotencyKey: "overage:org-1:2026-04" }),
    );
  });

  it("skips (no invoice item) when the org has no Stripe customer", async () => {
    const create = jest.fn(async () => ({ id: "ii_1" }));
    const report = makeStripeOverageReporter({
      stripe: { invoiceItems: { create } } as never,
      getCustomerId: async () => null,
    });
    await report({ organizationId: "org-1", yearMonth: "2026-04", totalCents: 540 });
    expect(create).not.toHaveBeenCalled();
  });
});
