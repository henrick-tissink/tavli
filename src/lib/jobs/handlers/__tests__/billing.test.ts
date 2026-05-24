/**
 * @jest-environment node
 */
jest.mock("server-only", () => ({}));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: {} }));
jest.mock("@/lib/db/schema", () => ({ organizations: {} }));
jest.mock("drizzle-orm", () => ({ eq: jest.fn() }));
jest.mock("@react-email/render", () => ({
  render: jest.fn().mockResolvedValue("<html>rendered</html>"),
}));

import { makeTrialReminderHandler } from "../billing";

function deps(over: Record<string, unknown> = {}) {
  return {
    loadActiveSubscription: jest.fn().mockResolvedValue({
      status: "trialing",
      tier: "pro",
      frequency: "monthly",
      trial_ends_at: new Date("2026-08-22"),
    }),
    loadOrgContact: jest.fn().mockResolvedValue({ email: "owner@venue.ro", locale: "en" }),
    sendEmail: jest.fn().mockResolvedValue({ ok: true, messageId: "m1", logId: "l1" }),
    day: 60 as const,
    ...over,
  };
}

describe("trial reminder handler", () => {
  it("sends TrialEndingEmail when the subscription is still trialing", async () => {
    const d = deps();
    const handle = makeTrialReminderHandler(d as never);
    await handle({ organizationId: "org-1" });
    expect(d.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@venue.ro", templateKey: "trial_ending_day_60", locale: "en" }),
    );
  });

  it("no-ops when the subscription is no longer trialing (converted/cancelled)", async () => {
    const d = deps({ loadActiveSubscription: jest.fn().mockResolvedValue({ status: "active" }) });
    const handle = makeTrialReminderHandler(d as never);
    await handle({ organizationId: "org-1" });
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("no-ops when there is no active subscription", async () => {
    const d = deps({ loadActiveSubscription: jest.fn().mockResolvedValue(null) });
    const handle = makeTrialReminderHandler(d as never);
    await handle({ organizationId: "org-1" });
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("no-ops when the org has no contact email", async () => {
    const d = deps({ loadOrgContact: jest.fn().mockResolvedValue(null) });
    const handle = makeTrialReminderHandler(d as never);
    await handle({ organizationId: "org-1" });
    expect(d.sendEmail).not.toHaveBeenCalled();
  });
});
