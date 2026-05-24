/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ subscriptions: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn(), and: jest.fn(), inArray: jest.fn(), sql: Object.assign(jest.fn(), { raw: jest.fn() }) }));

import { makeCancelSubscription, computeProRataRefundCents } from "../cancel-subscription";

describe("computeProRataRefundCents", () => {
  const start = new Date("2026-01-01");
  const through = new Date("2027-01-01");
  it("refunds ~half the year at the midpoint", () => {
    const mid = new Date("2026-07-02"); // ~half
    const r = computeProRataRefundCents({ annualPaidThrough: through, currentPeriodStart: start, amountPaidCents: 60000, now: mid });
    expect(r).toBeGreaterThan(29000);
    expect(r).toBeLessThan(31000);
  });
  it("returns 0 once the paid period has elapsed", () => {
    expect(
      computeProRataRefundCents({ annualPaidThrough: through, currentPeriodStart: start, amountPaidCents: 60000, now: new Date("2027-06-01") }),
    ).toBe(0);
  });
});

const ROW = {
  id: "local-1",
  stripeSubscriptionId: "sub_1",
  status: "active",
  frequency: "monthly",
  annualPaidThrough: null,
  currentPeriodStart: new Date("2026-05-01"),
};

function db(row: unknown) {
  return {
    select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue(row ? [row] : []) })) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
  };
}
function deps(over: Record<string, unknown> = {}) {
  return {
    db: db(ROW),
    stripe: {
      subscriptions: { update: jest.fn().mockResolvedValue({}), cancel: jest.fn().mockResolvedValue({}) },
      refunds: { create: jest.fn().mockResolvedValue({ id: "re_1", amount: 30000 }) },
      invoices: { list: jest.fn().mockResolvedValue({ data: [{ payment_intent: "pi_1", amount_paid: 60000 }] }) },
    },
    recordBillingAudit: jest.fn().mockResolvedValue(undefined),
    triggerDataExport: jest.fn().mockResolvedValue(undefined),
    now: () => new Date("2026-05-15"),
    ...over,
  };
}

describe("cancelSubscription", () => {
  it("period_end sets cancel_at_period_end + audits", async () => {
    const d = deps();
    const cancel = makeCancelSubscription(d as never);
    await cancel({ organizationId: "org-1", mode: "period_end", reason: "too_expensive" });
    expect(d.stripe.subscriptions.update).toHaveBeenCalledWith("sub_1", { cancel_at_period_end: true });
    expect(d.recordBillingAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "billing.subscription_cancelled" }));
  });

  it("immediate (monthly) cancels with no refund", async () => {
    const d = deps();
    const cancel = makeCancelSubscription(d as never);
    await cancel({ organizationId: "org-1", mode: "immediate" });
    expect(d.stripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1");
    expect(d.stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("immediate (annual, mid-term) issues a pro-rata refund + refund audit", async () => {
    const annualRow = { ...ROW, frequency: "annual", annualPaidThrough: new Date("2027-05-01"), currentPeriodStart: new Date("2026-05-01") };
    const d = deps({ db: db(annualRow) });
    const cancel = makeCancelSubscription(d as never);
    await cancel({ organizationId: "org-1", mode: "immediate" });
    expect(d.stripe.refunds.create).toHaveBeenCalledWith(expect.objectContaining({ payment_intent: "pi_1", reason: "requested_by_customer" }));
    expect(d.recordBillingAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "billing.refund_issued" }));
  });

  it("rejects when there is no cancellable subscription", async () => {
    const d = deps({ db: db(null) });
    const cancel = makeCancelSubscription(d as never);
    await expect(cancel({ organizationId: "org-1", mode: "immediate" })).rejects.toThrow(/not_found/);
  });

  it("fires the data-export seam for customer-initiated cancels", async () => {
    const d = deps();
    const cancel = makeCancelSubscription(d as never);
    await cancel({ organizationId: "org-1", mode: "period_end", actorUserId: "user-1" });
    expect(d.triggerDataExport).toHaveBeenCalledWith("org-1", "user-1");
  });

  it("does NOT fire the export seam for system auto-cancels (no actor)", async () => {
    const d = deps();
    const cancel = makeCancelSubscription(d as never);
    await cancel({ organizationId: "org-1", mode: "immediate" });
    expect(d.triggerDataExport).not.toHaveBeenCalled();
  });
});
