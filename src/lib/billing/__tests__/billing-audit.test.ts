/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ billingAuditLog: {} }));

import { recordBillingAudit } from "../billing-audit";

describe("recordBillingAudit", () => {
  it("inserts a row with both org-id columns equal + the typed event_type", async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    const executor = { insert: jest.fn().mockReturnValue({ values }) } as never;
    await recordBillingAudit(
      {
        organizationId: "org-1",
        eventType: "billing.subscription_created",
        actorUserId: "u1",
        context: { tier: "pro" },
      },
      executor,
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        organizationIdAtEvent: "org-1",
        eventType: "billing.subscription_created",
        actorUserId: "u1",
        context: { tier: "pro" },
      }),
    );
  });

  it("rejects a sensitive PII key in context — keeps the 7yr fiscal log PII-free (NEW-7)", async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    const executor = { insert: jest.fn().mockReturnValue({ values }) } as never;
    await expect(
      recordBillingAudit(
        { organizationId: "o1", eventType: "billing.subscription_cancelled", context: { email: "x@y.com" } },
        executor,
      ),
    ).rejects.toThrow(/sensitive/i);
    expect((executor as { insert: jest.Mock }).insert).not.toHaveBeenCalled();
  });

  it("defaults actorUserId to null when omitted", async () => {
    const values = jest.fn().mockResolvedValue(undefined);
    const executor = { insert: jest.fn().mockReturnValue({ values }) } as never;
    await recordBillingAudit(
      { organizationId: "org-2", eventType: "billing.payment_succeeded", context: {} },
      executor,
    );
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: null }));
  });
});
