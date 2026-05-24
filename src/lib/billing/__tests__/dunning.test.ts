/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ subscriptions: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn(), and: jest.fn(), lte: jest.fn(), inArray: jest.fn(), sql: Object.assign(jest.fn(), { raw: jest.fn() }) }));

import { computeBillingAccess, makeEnforceDunningTier } from "../dunning";

const NOW = new Date("2026-05-24T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe("computeBillingAccess", () => {
  it("active/trialing → full", () => {
    expect(computeBillingAccess({ status: "active", pastDueSince: null, now: NOW })).toBe("full");
    expect(computeBillingAccess({ status: "trialing", pastDueSince: null, now: NOW })).toBe("full");
  });
  it("past_due days 0–6 → full, day ≥7 → soft_lock", () => {
    expect(computeBillingAccess({ status: "past_due", pastDueSince: daysAgo(3), now: NOW })).toBe("full");
    expect(computeBillingAccess({ status: "past_due", pastDueSince: daysAgo(7), now: NOW })).toBe("soft_lock");
    expect(computeBillingAccess({ status: "past_due", pastDueSince: daysAgo(20), now: NOW })).toBe("soft_lock");
  });
  it("unpaid → read_only", () => {
    expect(computeBillingAccess({ status: "unpaid", pastDueSince: daysAgo(30), now: NOW })).toBe("read_only");
  });
});

function makeDb(rows: unknown[]) {
  return {
    select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue(rows) })) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
  };
}

describe("enforceDunningTier", () => {
  it("transitions a >21-day past_due subscription to unpaid + audits", async () => {
    const db = makeDb([{ id: "s1", organizationId: "org-1" }]);
    const recordBillingAudit = jest.fn().mockResolvedValue(undefined);
    const enforce = makeEnforceDunningTier({ db: db as never, recordBillingAudit, now: () => NOW });
    await enforce();
    expect(db.update).toHaveBeenCalled();
    expect(recordBillingAudit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "billing.subscription_updated", context: expect.objectContaining({ after_status: "unpaid" }) }),
    );
  });

  it("does nothing when no past_due subscription is 21+ days old", async () => {
    const db = makeDb([]);
    const recordBillingAudit = jest.fn();
    const enforce = makeEnforceDunningTier({ db: db as never, recordBillingAudit, now: () => NOW });
    await enforce();
    expect(db.update).not.toHaveBeenCalled();
    expect(recordBillingAudit).not.toHaveBeenCalled();
  });
});
