/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ subscriptions: {}, restaurants: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn(), and: jest.fn(), isNull: jest.fn(), isNotNull: jest.fn(), lte: jest.fn(), count: jest.fn(), sql: Object.assign(jest.fn(), { raw: jest.fn() }) }));
jest.mock("@/lib/billing/price-ids", () => ({ priceIdForTierFrequency: jest.fn((t, f) => `price_${t}_${f}`) }));

import { makeChangePlanActions } from "../change-plan";

// Every select() resolves `selectResult` (each test triggers only one query kind).
function makeDb(selectResult: unknown[] = []) {
  return {
    select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue(selectResult) })) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
  };
}

const BASE_SUB = {
  subscriptionId: "local-1",
  stripeSubscriptionId: "sub_1",
  tier: "base",
  frequency: "monthly",
  current_period_end: new Date("2026-06-01"),
  items: [{ id: "i1", stripeSubscriptionItemId: "si_base", kind: "base_tier", quantity: 1 }],
};

function deps(over: Record<string, unknown> = {}) {
  return {
    loadActiveSubscription: jest.fn().mockResolvedValue(BASE_SUB),
    db: makeDb(),
    stripe: { subscriptions: { update: jest.fn().mockResolvedValue({}) } },
    recordBillingAudit: jest.fn().mockResolvedValue(undefined),
    syncExtraLocationQuantity: jest.fn().mockResolvedValue(undefined),
    now: () => new Date("2026-05-15"),
    ...over,
  };
}

describe("upgradeSubscriptionTier", () => {
  it("swaps the base_tier item to the Pro price + audits", async () => {
    const d = deps();
    const a = makeChangePlanActions(d as never);
    await a.upgradeSubscriptionTier("org-1");
    expect(d.stripe.subscriptions.update).toHaveBeenCalledWith(
      "sub_1",
      expect.objectContaining({ proration_behavior: "create_prorations" }),
    );
    expect(d.recordBillingAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "billing.subscription_upgraded" }));
  });
});

describe("downgradeSubscriptionTier", () => {
  it("blocks with TV1005 when the org has more than one live venue", async () => {
    const d = deps({
      db: makeDb([{ c: 3 }]),
      loadActiveSubscription: jest.fn().mockResolvedValue({ ...BASE_SUB, tier: "pro" }),
    });
    const a = makeChangePlanActions(d as never);
    await expect(a.downgradeSubscriptionTier("org-1")).rejects.toThrow(/TV1005/);
  });
});

describe("requestFrequencyChange", () => {
  it("sets pending columns + audits", async () => {
    const d = deps();
    const a = makeChangePlanActions(d as never);
    await a.requestFrequencyChange("org-1", "annual");
    expect(d.db.update).toHaveBeenCalled();
    expect(d.recordBillingAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "billing.frequency_change_requested" }));
  });
});

describe("applyPendingFrequencyChanges (cron)", () => {
  it("swaps prices, clears pending, audits frequency_changed for each due sub", async () => {
    const pending = [{ id: "local-1", organizationId: "org-1", stripeSubscriptionId: "sub_1", pendingFrequencyChange: "annual" }];
    const d = deps({ db: makeDb(pending) });
    const a = makeChangePlanActions(d as never);
    await a.applyPendingFrequencyChanges();
    expect(d.stripe.subscriptions.update).toHaveBeenCalled();
    expect(d.recordBillingAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "billing.frequency_changed" }));
  });
});
