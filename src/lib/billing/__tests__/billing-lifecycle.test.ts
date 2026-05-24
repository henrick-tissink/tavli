/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ subscriptions: {}, organizations: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn(), and: jest.fn(), lt: jest.fn(), lte: jest.fn(), isNull: jest.fn(), inArray: jest.fn(), sql: Object.assign(jest.fn(), { raw: jest.fn() }) }));

import {
  makeExpireOrphanIncomplete,
  makeArchiveCancelledOrgs,
  makeSyncStripeSubscription,
} from "../billing-lifecycle";

const NOW = new Date("2026-05-24T00:00:00Z");

describe("expireOrphanIncomplete", () => {
  it("deletes incomplete subscriptions with no payment method", async () => {
    const del = { where: jest.fn().mockResolvedValue(undefined) };
    const db = { delete: jest.fn(() => del) };
    const run = makeExpireOrphanIncomplete({ db: db as never, now: () => NOW });
    await run();
    expect(db.delete).toHaveBeenCalled();
    expect(del.where).toHaveBeenCalled();
  });
});

describe("archiveCancelledOrgs", () => {
  it("suspends orgs cancelled more than 30 days ago", async () => {
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue([{ organizationId: "org-1" }]) })) })),
      update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
    };
    const run = makeArchiveCancelledOrgs({ db: db as never, now: () => NOW });
    await run();
    expect(db.update).toHaveBeenCalled();
  });
});

describe("syncStripeSubscription", () => {
  it("reconciles a drifted mirror status from Stripe", async () => {
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue([{ id: "s1", stripeSubscriptionId: "sub_1", status: "past_due" }]) })) })),
      update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
    };
    const stripe = { subscriptions: { retrieve: jest.fn().mockResolvedValue({ status: "active" }) } };
    const run = makeSyncStripeSubscription({ db: db as never, stripe: stripe as never });
    await run();
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_1");
    expect(db.update).toHaveBeenCalled();
  });

  it("does not update when the mirror already matches Stripe", async () => {
    const db = {
      select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn().mockResolvedValue([{ id: "s1", stripeSubscriptionId: "sub_1", status: "active" }]) })) })),
      update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
    };
    const stripe = { subscriptions: { retrieve: jest.fn().mockResolvedValue({ status: "active" }) } };
    const run = makeSyncStripeSubscription({ db: db as never, stripe: stripe as never });
    await run();
    expect(db.update).not.toHaveBeenCalled();
  });
});
