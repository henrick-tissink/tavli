/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ organizations: {}, subscriptions: {}, subscriptionItems: {} }));
jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  isNotNull: jest.fn(),
  sql: Object.assign(jest.fn(), { raw: jest.fn() }),
}));
jest.mock("@/lib/billing/price-ids", () => ({
  priceIdForTierFrequency: jest.fn(() => "price_tier"),
  priceIdForExtraLocation: jest.fn(() => "price_extra"),
}));
jest.mock("@/lib/jobs/keys", () => ({
  JOBS: {
    billing: {
      sendReminderDay60: "billing.send-reminder-day-60",
      sendReminderDay75: "billing.send-reminder-day-75",
      sendReminderDay85: "billing.send-reminder-day-85",
    },
  },
}));

import { makeStartSubscription } from "../start-subscription";

const NOW = new Date("2026-05-24T00:00:00Z");
const ORG = {
  id: "org-1",
  name: "Tom Yum",
  legalName: "Tom Yum SRL",
  countryCode: "RO",
  taxId: "RO123",
  customerType: "business",
  stripeCustomerId: null,
  reTrialGranted: false,
  primaryContactEmail: "a@b.ro",
};

function makeDb(q: unknown[][]) {
  const db: { _q: unknown[][] } & Record<string, unknown> = {
    _q: q,
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve(db._q.length ? db._q.shift() : [])),
      })),
    })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ id: "local-sub-1" }]) })),
    })),
    transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(db)),
  };
  return db;
}

function deps(over: Record<string, unknown> = {}) {
  return {
    stripe: {
      customers: { create: jest.fn().mockResolvedValue({ id: "cus_new" }) },
      subscriptions: {
        create: jest.fn().mockResolvedValue({
          id: "sub_new",
          status: "trialing",
          items: { data: [{ id: "si_base", price: { id: "price_tier", unit_amount: 6000 }, quantity: 1 }] },
        }),
      },
      checkout: { sessions: { create: jest.fn().mockResolvedValue({ url: "https://checkout.test/x" }) } },
    },
    db: makeDb([[ORG], []]),
    enqueue: jest.fn().mockResolvedValue("job-id"),
    recordBillingAudit: jest.fn().mockResolvedValue(undefined),
    now: () => NOW,
    siteUrl: "https://tavli.ro",
    ...over,
  };
}

describe("startSubscription", () => {
  it("creates customer + subscription + checkout, inserts mirror, enqueues 3 reminders, audits, returns url", async () => {
    const d = deps();
    const start = makeStartSubscription(d as never);
    const res = await start({ organizationId: "org-1", tier: "pro", frequency: "monthly" });
    expect(res.stripeCheckoutUrl).toBe("https://checkout.test/x");
    expect((d.stripe.customers.create as jest.Mock)).toHaveBeenCalled();
    expect((d.stripe.subscriptions.create as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ payment_behavior: "default_incomplete" }),
    );
    expect((d.enqueue as jest.Mock)).toHaveBeenCalledTimes(3);
    expect((d.recordBillingAudit as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "billing.subscription_created" }),
    );
  });

  it("reuses an existing stripe_customer_id (no customers.create)", async () => {
    const d = deps({ db: makeDb([[{ ...ORG, stripeCustomerId: "cus_existing" }], []]) });
    const start = makeStartSubscription(d as never);
    await start({ organizationId: "org-1", tier: "base", frequency: "monthly" });
    expect((d.stripe.customers.create as jest.Mock)).not.toHaveBeenCalled();
  });

  it("throws TV1001 when a trial was already used", async () => {
    const d = deps({ db: makeDb([[ORG], [{ id: "sub-old" }]]) });
    const start = makeStartSubscription(d as never);
    await expect(start({ organizationId: "org-1", tier: "base", frequency: "monthly" })).rejects.toThrow(/TV1001/);
  });

  it("throws invalid_input when customer_type is null", async () => {
    const d = deps({ db: makeDb([[{ ...ORG, customerType: null }], []]) });
    const start = makeStartSubscription(d as never);
    await expect(start({ organizationId: "org-1", tier: "base", frequency: "monthly" })).rejects.toThrow(
      /invalid_input/,
    );
  });
});
