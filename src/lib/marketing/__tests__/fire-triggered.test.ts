/**
 * @jest-environment node
 */
import { makeFireTriggeredCampaign } from "@/lib/marketing/fire-triggered";

function harness(
  campaigns: Array<{ id: string; channel: string; trigger_offset_seconds?: number | null; campaign_version_id?: string | null }>,
) {
  let insertQuery = "";
  const db = {
    execute: jest.fn(async (q: unknown) => {
      const t = JSON.stringify(q);
      if (t.includes("FROM diners")) return [{ email: "a@b.com", phone: "+40712345678", locale: "ro" }];
      if (t.includes("FROM marketing_campaigns")) return campaigns;
      if (t.includes("INSERT INTO marketing_sends")) { insertQuery = t; return [{ id: "s1" }]; }
      return [];
    }),
  };
  const enqueue = jest.fn(async (_k: string, _d?: unknown, _o?: unknown) => "j");
  return { db, enqueue, getInsertQuery: () => insertQuery, fire: makeFireTriggeredCampaign({ db: db as never, enqueue: enqueue as never }) };
}

describe("makeFireTriggeredCampaign", () => {
  test("matching campaign with no offset → enqueues send-message immediately", async () => {
    const h = harness([{ id: "c1", channel: "email", trigger_offset_seconds: 0 }]);
    await h.fire({ triggerEvent: "reservation.completed", dinerId: "d1", organizationId: "o1", restaurantId: "r1" });
    expect(h.enqueue).toHaveBeenCalledWith("marketing.send-message", { sendId: "s1" }, {});
  });

  test("campaign offset is applied as the leaf startAfter (seconds)", async () => {
    const h = harness([{ id: "c1", channel: "email", trigger_offset_seconds: 7200 }]);
    await h.fire({ triggerEvent: "reservation.completed", dinerId: "d1", organizationId: "o1", restaurantId: "r1" });
    expect(h.enqueue).toHaveBeenCalledWith("marketing.send-message", { sendId: "s1" }, { startAfter: 7200 });
  });

  test("negative offset clamps to immediate", async () => {
    const h = harness([{ id: "c1", channel: "email", trigger_offset_seconds: -604800 }]);
    await h.fire({ triggerEvent: "diner.birthday", dinerId: "d1", organizationId: "o1" });
    expect(h.enqueue).toHaveBeenCalledWith("marketing.send-message", { sendId: "s1" }, {});
  });

  test("stamps the campaign's content-version snapshot on the send (§11 §4.4)", async () => {
    const h = harness([{ id: "c1", channel: "email", trigger_offset_seconds: 0, campaign_version_id: "ver-7" }]);
    await h.fire({ triggerEvent: "reservation.completed", dinerId: "d1", organizationId: "o1", restaurantId: "r1" });
    expect(h.getInsertQuery()).toContain("campaign_version_id");
    expect(h.getInsertQuery()).toContain("ver-7");
  });

  test("no matching campaign → no enqueue", async () => {
    const h = harness([]);
    await h.fire({ triggerEvent: "reservation.no_show", dinerId: "d1", organizationId: "o1" });
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  test("unknown diner → no-op", async () => {
    const db = { execute: jest.fn(async () => []) };
    const enqueue = jest.fn(async (_k: string, _d?: unknown) => "j");
    await makeFireTriggeredCampaign({ db: db as never, enqueue: enqueue as never })({ triggerEvent: "diner.birthday", dinerId: "d1", organizationId: "o1" });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
