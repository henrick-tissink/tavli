/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({
  subscriptions: {},
  subscriptionItems: {},
  invoices: {},
  paymentMethods: {},
  organizations: {},
}));
jest.mock("drizzle-orm", () => ({ eq: jest.fn(), sql: Object.assign(jest.fn(), { raw: jest.fn() }) }));

import { makeStripeWebhookRouter } from "../stripe-webhook-router";

function makeDb(over: Record<string, unknown> = {}) {
  const db: { _q: unknown[][] } & Record<string, unknown> = {
    _q: (over.q as unknown[][]) ?? [],
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve(db._q.length ? db._q.shift() : [])),
      })),
    })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })) })),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      })),
    })),
  };
  return db;
}

function deps(over: Record<string, unknown> = {}) {
  return {
    db: makeDb(over),
    recordBillingAudit: jest.fn().mockResolvedValue(undefined),
    wasEventApplied: jest.fn().mockResolvedValue(false),
    sendEmail: jest.fn().mockResolvedValue({ ok: true }),
    render: jest.fn().mockResolvedValue("<html></html>"),
    stripe: { subscriptions: { update: jest.fn().mockResolvedValue({}) } },
    ...over,
  };
}

function evt(type: string, object: Record<string, unknown>, id = "evt_1") {
  return { id, type, data: { object } } as never;
}

describe("stripe-webhook-router", () => {
  it("customer.subscription.updated mirrors status + audits", async () => {
    const d = deps({ q: [[{ organizationId: "org-1" }]] });
    const router = makeStripeWebhookRouter(d as never);
    await router.handle(
      evt("customer.subscription.updated", {
        id: "sub_1",
        status: "active",
        customer: "cus_1",
        current_period_end: 1_780_000_000,
        cancel_at_period_end: false,
        items: { data: [] },
      }),
    );
    expect(d.db.update).toHaveBeenCalled();
    expect(d.recordBillingAudit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "billing.subscription_updated" }),
    );
  });

  it("short-circuits (no mutation) when the event was already applied (layer-2)", async () => {
    const d = deps({ q: [[{ organizationId: "org-1" }]] });
    (d.wasEventApplied as jest.Mock).mockResolvedValue(true);
    const router = makeStripeWebhookRouter(d as never);
    await router.handle(evt("customer.subscription.updated", { id: "sub_1", status: "active", customer: "cus_1", items: { data: [] } }));
    expect(d.db.update).not.toHaveBeenCalled();
    expect(d.recordBillingAudit).not.toHaveBeenCalled();
  });

  it("invoice.paid audits payment_succeeded", async () => {
    const d = deps({ q: [[{ organizationId: "org-1" }]] });
    const router = makeStripeWebhookRouter(d as never);
    await router.handle(evt("invoice.paid", { id: "in_1", customer: "cus_1", status: "paid", amount_paid: 6000, amount_due: 6000, currency: "eur" }));
    expect(d.recordBillingAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "billing.payment_succeeded" }));
  });

  it("invoice.payment_failed sets past_due + audits payment_failed", async () => {
    const d = deps({ q: [[{ organizationId: "org-1" }]] });
    const router = makeStripeWebhookRouter(d as never);
    await router.handle(evt("invoice.payment_failed", { id: "in_2", customer: "cus_1", subscription: "sub_1", status: "open", amount_due: 6000, currency: "eur" }));
    expect(d.recordBillingAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "billing.payment_failed" }));
    expect(d.db.update).toHaveBeenCalled();
  });

  it("setup_intent.succeeded attaches PM, sends consent email once, audits", async () => {
    // 1st select: subscription by stripe id (found, consent not yet sent);
    // 2nd select: org contact (email + locale) for the consent email.
    const d = deps({
      q: [
        [{ id: "local-1", organizationId: "org-1", stripeSubscriptionId: "sub_1", consentEmailSentAt: null }],
        [{ email: "owner@venue.ro", locale: "en" }],
      ],
    });
    const router = makeStripeWebhookRouter(d as never);
    await router.handle(
      evt("setup_intent.succeeded", {
        id: "seti_1",
        payment_method: "pm_1",
        metadata: { subscription_id: "sub_1", organization_id: "org-1" },
      }),
    );
    expect(d.stripe.subscriptions.update).toHaveBeenCalledWith("sub_1", expect.objectContaining({ default_payment_method: "pm_1" }));
    expect(d.sendEmail).toHaveBeenCalled();
    expect(d.recordBillingAudit).toHaveBeenCalledWith(expect.objectContaining({ eventType: "billing.psd2_consent_captured" }));
  });

  it("setup_intent.succeeded throws (→500 retry) when subscription_id metadata is missing", async () => {
    const d = deps();
    const router = makeStripeWebhookRouter(d as never);
    await expect(
      router.handle(evt("setup_intent.succeeded", { id: "seti_2", payment_method: "pm_1", metadata: {} })),
    ).rejects.toThrow();
  });

  it("unknown event types are a no-op", async () => {
    const d = deps();
    const router = makeStripeWebhookRouter(d as never);
    await router.handle(evt("customer.created", { id: "cus_x" }));
    expect(d.db.update).not.toHaveBeenCalled();
    expect(d.recordBillingAudit).not.toHaveBeenCalled();
  });
});
