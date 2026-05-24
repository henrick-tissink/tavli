/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));

import { maybeStartTrial } from "../onboard-trial-seam";

function deps(over: Record<string, unknown> = {}) {
  return {
    loadCustomerType: jest.fn().mockResolvedValue("business"),
    hasActiveSubscription: jest.fn().mockResolvedValue(false),
    startSubscription: jest.fn().mockResolvedValue({ stripeCheckoutUrl: "https://checkout/x" }),
    ...over,
  };
}

describe("maybeStartTrial (onboard activation seam)", () => {
  it("starts the trial when customer_type is set and no active subscription exists", async () => {
    const d = deps();
    const res = await maybeStartTrial("org-1", d as never);
    expect(res.started).toBe(true);
    expect(d.startSubscription).toHaveBeenCalledWith({
      organizationId: "org-1",
      tier: "base",
      frequency: "monthly",
    });
  });

  it("no-ops (does NOT call startSubscription) when customer_type is null — today's onboard reality", async () => {
    const d = deps({ loadCustomerType: jest.fn().mockResolvedValue(null) });
    const res = await maybeStartTrial("org-1", d as never);
    expect(res.started).toBe(false);
    if (!res.started) expect(res.reason).toBe("no_customer_type");
    expect(d.startSubscription).not.toHaveBeenCalled();
  });

  it("no-ops when an active subscription already exists", async () => {
    const d = deps({ hasActiveSubscription: jest.fn().mockResolvedValue(true) });
    const res = await maybeStartTrial("org-1", d as never);
    expect(res.started).toBe(false);
    if (!res.started) expect(res.reason).toBe("already_subscribed");
    expect(d.startSubscription).not.toHaveBeenCalled();
  });
});
