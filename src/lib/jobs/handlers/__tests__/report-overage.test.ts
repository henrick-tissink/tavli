/**
 * @jest-environment node
 *
 * NEW-9: the marketing overage feed must be consumed — recorded durably and
 * reported to Stripe — not silently dropped.
 */
jest.mock("server-only", () => ({}));

import { makeReportMarketingOverageHandler } from "../billing";

describe("handleReportMarketingOverage", () => {
  it("records the total overage + reports to Stripe", async () => {
    const recordBillingAudit = jest.fn().mockResolvedValue(undefined);
    const reportToStripe = jest.fn().mockResolvedValue(undefined);
    const handle = makeReportMarketingOverageHandler({ recordBillingAudit, reportToStripe } as never);
    await handle({
      organizationId: "org-1",
      yearMonth: "2026-04-01",
      lines: [
        { channel: "sms", overageCount: 100, cents: 600 },
        { channel: "whatsapp", overageCount: 50, cents: 150 },
      ],
    });
    expect(recordBillingAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "billing.overage_reported",
        context: expect.objectContaining({ total_cents: 750 }),
      }),
    );
    expect(reportToStripe).toHaveBeenCalledWith(expect.objectContaining({ totalCents: 750 }));
  });

  it("no-ops when there is no billable overage", async () => {
    const recordBillingAudit = jest.fn();
    const handle = makeReportMarketingOverageHandler({ recordBillingAudit } as never);
    await handle({ organizationId: "org-1", yearMonth: "2026-04-01", lines: [{ channel: "email", overageCount: 0, cents: 0 }] });
    expect(recordBillingAudit).not.toHaveBeenCalled();
  });
});
