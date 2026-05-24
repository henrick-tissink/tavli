/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ restaurants: {}, subscriptionItems: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn(), and: jest.fn(), isNull: jest.fn(), count: jest.fn() }));
jest.mock("@/lib/billing/price-ids", () => ({ priceIdForExtraLocation: jest.fn(() => "price_extra_m") }));

import { makeSyncExtraLocationQuantity } from "../sync-extra-location";

function db(venueCount: number) {
  return {
    select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue([{ c: venueCount }]) })) })),
    insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue(undefined) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
  };
}

function deps(over: Record<string, unknown> = {}) {
  return {
    loadActiveSubscription: jest.fn().mockResolvedValue({
      subscriptionId: "local-1",
      stripeSubscriptionId: "sub_1",
      tier: "pro",
      frequency: "monthly",
      items: [{ id: "i1", stripeSubscriptionItemId: "si_base", kind: "base_tier", quantity: 1 }],
    }),
    db: db(5),
    stripe: {
      subscriptionItems: {
        create: jest.fn().mockResolvedValue({ id: "si_extra" }),
        update: jest.fn().mockResolvedValue({ id: "si_extra" }),
      },
    },
    ...over,
  };
}

describe("syncExtraLocationQuantity", () => {
  it("creates the extra_location item for a pro org with 5 venues (extra = 2)", async () => {
    const d = deps();
    const sync = makeSyncExtraLocationQuantity(d as never);
    await sync("org-1");
    expect(d.stripe.subscriptionItems.create).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 2, proration_behavior: "create_prorations" }),
    );
  });

  it("updates quantity when the extra_location item exists but differs", async () => {
    const d = deps({
      loadActiveSubscription: jest.fn().mockResolvedValue({
        subscriptionId: "local-1",
        stripeSubscriptionId: "sub_1",
        tier: "pro",
        frequency: "monthly",
        items: [{ id: "i2", stripeSubscriptionItemId: "si_extra", kind: "extra_location", quantity: 1 }],
      }),
      db: db(5),
    });
    const sync = makeSyncExtraLocationQuantity(d as never);
    await sync("org-1");
    expect(d.stripe.subscriptionItems.update).toHaveBeenCalledWith("si_extra", expect.objectContaining({ quantity: 2 }));
  });

  it("no-ops for a base-tier org", async () => {
    const d = deps({ loadActiveSubscription: jest.fn().mockResolvedValue({ tier: "base", items: [] }) });
    const sync = makeSyncExtraLocationQuantity(d as never);
    await sync("org-1");
    expect(d.stripe.subscriptionItems.create).not.toHaveBeenCalled();
  });

  it("no-ops when there is no active subscription", async () => {
    const d = deps({ loadActiveSubscription: jest.fn().mockResolvedValue(null) });
    const sync = makeSyncExtraLocationQuantity(d as never);
    await sync("org-1");
    expect(d.stripe.subscriptionItems.create).not.toHaveBeenCalled();
  });

  it("no-ops when quantity already matches (3 venues = 0 extra, no item)", async () => {
    const d = deps({ db: db(3) });
    const sync = makeSyncExtraLocationQuantity(d as never);
    await sync("org-1");
    expect(d.stripe.subscriptionItems.create).not.toHaveBeenCalled();
    expect(d.stripe.subscriptionItems.update).not.toHaveBeenCalled();
  });
});
