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
jest.mock("@/lib/billing/dunning", () => ({ loadBillingAccess: jest.fn() }));
jest.mock("@/lib/jobs/enqueue", () => ({ enqueue: jest.fn() }));
jest.mock("@/lib/jobs/keys", () => ({ JOBS: { marketing: { fanOut: "marketing.fanOut" } } }));
jest.mock("@/lib/db/admin", () => ({ dbAdmin: { update: jest.fn(), insert: jest.fn() } }));

import { sendCampaignAction } from "../actions";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";
import { currentActor } from "@/lib/auth/current-actor";
import { can } from "@/lib/authz/can";
import { loadActiveSubscription } from "@/lib/billing/load-subscription";
import { enqueue } from "@/lib/jobs/enqueue";
import { dbAdmin } from "@/lib/db/admin";
import { loadBillingAccess } from "@/lib/billing/dunning";

// The draft→sending UPDATE now RETURNINGs the content; `rows` = matched rows
// (length 1 when a draft flips, 0 otherwise — content captured for the version
// snapshot the action inserts before fanning out).
function mockUpdateReturning(rows: Array<Record<string, unknown>>) {
  (dbAdmin.update as jest.Mock).mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue(rows),
      }),
    }),
  });
}
const SENT_ROW = { subjectTemplate: { ro: "S" }, bodyTemplate: { ro: "B" }, previewText: null };

// Captures the version-snapshot insert so tests can assert it ran.
const versionValues = jest.fn().mockReturnValue({ onConflictDoNothing: jest.fn().mockResolvedValue(undefined) });

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentSession as jest.Mock).mockResolvedValue({ userId: "u1", profile: { role: "restaurant_owner" } });
  (currentUserPrimaryRestaurant as jest.Mock).mockResolvedValue("rest-1");
  (currentActor as jest.Mock).mockResolvedValue({ actorUserId: "u1", impersonatorUserId: null });
  (can as jest.Mock).mockResolvedValue(true);
  (loadActiveSubscription as jest.Mock).mockResolvedValue({ tier: "pro" });
  (loadBillingAccess as jest.Mock).mockResolvedValue("full");
  (dbAdmin.insert as jest.Mock).mockReturnValue({ values: versionValues });
});

describe("sendCampaignAction", () => {
  it("snapshots a content version + enqueues the fan-out when a draft row is flipped", async () => {
    mockUpdateReturning([SENT_ROW]);
    const r = await sendCampaignAction("org-1", "camp-1");
    expect(r.ok).toBe(true);
    // §11 §4.4 — a version-1 snapshot is written before fan-out so each send
    // can carry campaign_version_id.
    expect(versionValues).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: "camp-1", versionNumber: 1, bodyTemplate: { ro: "B" } }),
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith("marketing.fanOut", { campaignId: "camp-1" });
  });

  it("refuses to send under dunning soft-lock/read-only (NEW-5) — no enqueue", async () => {
    (loadBillingAccess as jest.Mock).mockResolvedValue("soft_lock");
    mockUpdateReturning([SENT_ROW]);
    const r = await sendCampaignAction("org-1", "camp-1");
    expect(r.ok).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
    expect(dbAdmin.update).not.toHaveBeenCalled();
  });

  it("does NOT snapshot or enqueue when no draft row matched (already sent / concurrent loser)", async () => {
    mockUpdateReturning([]);
    const r = await sendCampaignAction("org-1", "camp-1");
    expect(r.ok).toBe(false);
    expect(versionValues).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
