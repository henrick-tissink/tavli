/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ subscriptions: {}, subscriptionItems: {}, organizations: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn(), and: jest.fn(), inArray: jest.fn() }));

import { makeLoadActiveSubscription, isProFeatureActive } from "../load-subscription";

describe("isProFeatureActive", () => {
  const pro = { tier: "pro", status: "active" } as Parameters<typeof isProFeatureActive>[0];
  it("true for an active Pro", () => {
    expect(isProFeatureActive({ ...pro!, status: "active" } as never)).toBe(true);
  });
  it("true for a trialing Pro", () => {
    expect(isProFeatureActive({ ...pro!, status: "trialing" } as never)).toBe(true);
  });
  it("false for a past_due Pro (a delinquent org keeps no Pro features)", () => {
    expect(isProFeatureActive({ ...pro!, status: "past_due" } as never)).toBe(false);
  });
  it("false for an unpaid Pro", () => {
    expect(isProFeatureActive({ ...pro!, status: "unpaid" } as never)).toBe(false);
  });
  it("false for Base tier and for null", () => {
    expect(isProFeatureActive({ ...pro!, tier: "base" } as never)).toBe(false);
    expect(isProFeatureActive(null)).toBe(false);
  });
});

const ACTIVE_ROW = {
  id: "sub-1",
  stripeSubscriptionId: "stripe_sub_1",
  stripeCustomerId: "cus_1",
  tier: "pro",
  status: "active",
  frequency: "monthly",
  trialEndsAt: null,
  currentPeriodEnd: new Date("2026-07-01"),
  pendingFrequencyChange: null,
};
const ITEM_ROW = { id: "item-1", stripeSubscriptionItemId: "si_1", kind: "base_tier", quantity: 1 };

function makeDb(opts: { subRows?: any[]; itemRows?: any[]; throwOnSelect?: boolean }) {
  let call = 0;
  return {
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => {
          if (opts.throwOnSelect) return Promise.reject(new Error("db down"));
          call += 1;
          return Promise.resolve(call === 1 ? (opts.subRows ?? []) : (opts.itemRows ?? []));
        }),
      }),
    })),
  };
}

describe("loadActiveSubscription", () => {
  it("maps an active subscription + its items", async () => {
    const load = makeLoadActiveSubscription({ db: makeDb({ subRows: [ACTIVE_ROW], itemRows: [ITEM_ROW] }) as any });
    const result = await load("org-1");
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("pro");
    expect(result!.stripeSubscriptionId).toBe("stripe_sub_1");
    expect(result!.items).toHaveLength(1);
    expect(result!.items[0].kind).toBe("base_tier");
  });

  it("returns null when the org has no subscription row", async () => {
    const load = makeLoadActiveSubscription({ db: makeDb({ subRows: [] }) as any });
    expect(await load("org-1")).toBeNull();
  });

  it("returns null (no throw) when the read fails", async () => {
    const load = makeLoadActiveSubscription({ db: makeDb({ throwOnSelect: true }) as any });
    await expect(load("org-1")).resolves.toBeNull();
  });

  it("returns null when stripe_customer_id is null (orphan guard)", async () => {
    const orphan = { ...ACTIVE_ROW, stripeCustomerId: null };
    const load = makeLoadActiveSubscription({ db: makeDb({ subRows: [orphan] }) as any });
    expect(await load("org-1")).toBeNull();
  });
});
