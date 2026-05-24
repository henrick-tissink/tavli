/**
 * @jest-environment node
 *
 * sendCampaignAction duplicate-send guard (audit #13). A campaign may only be
 * sent from status='draft'; a sent/sending row must not re-enqueue the fan-out
 * (which re-inserts every marketing_sends), and two concurrent calls must not
 * both enqueue. The UPDATE … WHERE status='draft' is the atomic gate.
 */
jest.mock("server-only", () => ({}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("@/lib/auth/current-actor", () => ({ currentActor: jest.fn() }));
jest.mock("@/lib/restaurants/current-user", () => ({ currentUserPrimaryRestaurant: jest.fn() }));
jest.mock("@/lib/authz/can", () => ({ can: jest.fn() }));
jest.mock("@/lib/billing/load-subscription", () => ({ loadActiveSubscription: jest.fn() }));
jest.mock("@/lib/jobs/enqueue", () => ({ enqueue: jest.fn() }));
jest.mock("@/lib/jobs/keys", () => ({ JOBS: { marketing: { fanOut: "marketing.fanOut" } } }));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: { update: jest.fn() } }));

import { sendCampaignAction } from "../actions";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { can } from "@/lib/authz/can";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { enqueue } from "@/lib/jobs/enqueue";
import { dbAdmin } from "@/lib/db/admin";

function mockUpdateRowCount(rowCount: number) {
  (dbAdmin.update as jest.Mock).mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue({ rowCount }),
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentSession as jest.Mock).mockResolvedValue({ userId: "u1", profile: { role: "restaurant_owner" } });
  (currentUserPrimaryRestaurant as jest.Mock).mockResolvedValue("rest-1");
  (can as jest.Mock).mockResolvedValue(true);
  (loadActiveSubscription as jest.Mock).mockResolvedValue({ tier: "pro" });
});

describe("sendCampaignAction", () => {
  it("enqueues the fan-out when a draft row is flipped to sending", async () => {
    mockUpdateRowCount(1);
    const r = await sendCampaignAction("org-1", "camp-1");
    expect(r.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith("marketing.fanOut", { campaignId: "camp-1" });
  });

  it("does NOT enqueue when no draft row matched (already sent / concurrent loser)", async () => {
    mockUpdateRowCount(0);
    const r = await sendCampaignAction("org-1", "camp-1");
    expect(r.ok).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
