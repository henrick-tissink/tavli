/**
 * @jest-environment node
 */
import { makeFireTriggeredCampaign } from "@/lib/marketing/fire-triggered";

function harness(campaigns: Array<{ id: string; channel: string }>) {
  const db = {
    execute: jest.fn(async (q: unknown) => {
      const t = JSON.stringify(q);
      if (t.includes("FROM diners")) return [{ email: "a@b.com", phone: "+40712345678", locale: "ro" }];
      if (t.includes("FROM marketing_campaigns")) return campaigns;
      if (t.includes("INSERT INTO marketing_sends")) return [{ id: "s1" }];
      return [];
    }),
  };
  const enqueue = jest.fn(async (_k: string, _d?: unknown) => "j");
  return { db, enqueue, fire: makeFireTriggeredCampaign({ db: db as never, enqueue: enqueue as never }) };
}

describe("makeFireTriggeredCampaign", () => {
  test("matching campaign → creates send + enqueues send-message", async () => {
    const h = harness([{ id: "c1", channel: "email" }]);
    await h.fire({ triggerEvent: "reservation.completed", dinerId: "d1", organizationId: "o1", restaurantId: "r1" });
    expect(h.enqueue).toHaveBeenCalledWith("marketing.send-message", { sendId: "s1" });
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
