/**
 * @jest-environment node
 */
import { makeFanOutCampaign } from "@/lib/marketing/fan-out";

const campaignRow = {
  id: "c1", organization_id: "o1", restaurant_id: "r1", channel: "email", recipient_count_estimate: 2,
  filter_dsl: { conditions: [{ dimension: "frequency", bucket: "regular" }] }, combinator: "and",
  is_snapshot: false, snapshot_diner_ids: null,
};

function harness(recipientCount: number) {
  const recipients = Array.from({ length: recipientCount }, (_, i) => ({ id: `d${i}`, email: `d${i}@x.com`, phone: null, locale: "ro" }));
  const db = {
    execute: jest.fn(async (q: unknown) => {
      const t = JSON.stringify(q);
      if (t.includes("FROM marketing_campaigns")) return [campaignRow];
      if (t.includes("FROM diners")) return recipients;
      if (t.includes("INSERT INTO marketing_sends")) return recipients.map((r) => ({ id: `s_${r.id}` }));
      return [];
    }),
  };
  const enqueue = jest.fn(async (_k: string, _d?: unknown) => "j");
  const recordAudit = jest.fn(async (_i: { action: string }) => {});
  return { db, enqueue, recordAudit, fanOut: makeFanOutCampaign({ db: db as never, enqueue: enqueue as never, recordAudit: recordAudit as never }) };
}

describe("makeFanOutCampaign", () => {
  test("small segment: inserts + enqueues one send-message each, no re-enqueue, fires campaign_sent", async () => {
    const h = harness(2);
    await h.fanOut({ campaignId: "c1" });
    const keys = h.enqueue.mock.calls.map((c) => c[0]);
    expect(keys.filter((k) => k === "marketing.send-message")).toHaveLength(2);
    expect(keys).not.toContain("marketing.triggered-campaign-fan-out");
    expect(h.recordAudit.mock.calls[0][0].action).toBe("marketing.campaign_sent");
  });

  test("full chunk (500): enqueues 500 + re-enqueues self keyset on last id (audit #15)", async () => {
    const h = harness(500);
    await h.fanOut({ campaignId: "c1" });
    const keys = h.enqueue.mock.calls.map((c) => c[0]);
    expect(keys.filter((k) => k === "marketing.send-message")).toHaveLength(500);
    const selfCall = h.enqueue.mock.calls.find((c) => c[0] === "marketing.triggered-campaign-fan-out");
    // Keyset, not OFFSET: the next chunk continues after the last diner id.
    expect(selfCall?.[1]).toMatchObject({ campaignId: "c1", afterId: "d499", processed: 500 });
  });

  test("continuation (afterId set) does not re-fire campaign_sent audit", async () => {
    const h = harness(0);
    await h.fanOut({ campaignId: "c1", afterId: "d499", processed: 500 });
    expect(h.recordAudit).not.toHaveBeenCalled();
  });
});
