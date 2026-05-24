/**
 * @jest-environment node
 */
import { overageCents, makeMonthlyOverageBilling } from "@/lib/marketing/jobs/monthly-overage";
import { thresholdFor, makeUsageAlert } from "@/lib/marketing/jobs/usage-alert";

describe("overageCents", () => {
  test("SMS €0.06, WhatsApp €0.03, email free; zero when not over", () => {
    expect(overageCents("sms", 100)).toBe(600);
    expect(overageCents("whatsapp", 100)).toBe(300);
    expect(overageCents("email", 100)).toBe(0);
    expect(overageCents("sms", 0)).toBe(0);
    expect(overageCents("sms", -5)).toBe(0);
  });
});

describe("makeMonthlyOverageBilling", () => {
  test("computes overage + hands off to billing per org with billable lines", async () => {
    const db = {
      execute: jest.fn(async (q: unknown) =>
        JSON.stringify(q).includes("SELECT organization_id, channel, sent_count")
          ? [
              { organization_id: "o1", channel: "sms", sent_count: 300, included_allowance: 250 }, // 50 over → 300¢
              { organization_id: "o1", channel: "email", sent_count: 2000, included_allowance: 1000 }, // free
            ]
          : [],
      ),
    };
    const enqueue = jest.fn(async (_k: string, _d?: unknown) => "j");
    await makeMonthlyOverageBilling({ db: db as never, enqueue: enqueue as never, now: () => new Date("2026-06-03T00:00:00Z") })();
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [key, payload] = enqueue.mock.calls[0];
    expect(key).toBe("billing.report-marketing-overage");
    expect(payload).toMatchObject({ organizationId: "o1", lines: [{ channel: "sms", overageCount: 50, cents: 300 }] });
  });

  test("no overage → no billing handoff", async () => {
    const db = {
      execute: jest.fn(async (q: unknown) =>
        JSON.stringify(q).includes("SELECT organization_id, channel, sent_count")
          ? [{ organization_id: "o1", channel: "sms", sent_count: 100, included_allowance: 250 }]
          : [],
      ),
    };
    const enqueue = jest.fn(async (_k: string, _d?: unknown) => "j");
    await makeMonthlyOverageBilling({ db: db as never, enqueue: enqueue as never, now: () => new Date("2026-06-03T00:00:00Z") })();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("usage alerts", () => {
  test("thresholdFor", () => {
    expect(thresholdFor(1000, 1000)).toBe(100);
    expect(thresholdFor(850, 1000)).toBe(80);
    expect(thresholdFor(500, 1000)).toBe(0);
  });

  test("alerts once per crossed threshold + bumps marker", async () => {
    const db = {
      execute: jest.fn(async (q: unknown) =>
        JSON.stringify(q).includes("FROM marketing_quota_usage WHERE year_month")
          ? [
              { organization_id: "o1", channel: "email", sent_count: 850, included_allowance: 1000, last_alert_threshold: 0 }, // crosses 80
              { organization_id: "o1", channel: "sms", sent_count: 100, included_allowance: 250, last_alert_threshold: 0 }, // no
            ]
          : [],
      ),
    };
    const sendAlert = jest.fn(async (_i: { organizationId: string; channel: string; threshold: number; sentCount: number; allowance: number }) => {});
    await makeUsageAlert({ db: db as never, sendAlert })();
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0][0]).toMatchObject({ channel: "email", threshold: 80 });
  });
});
