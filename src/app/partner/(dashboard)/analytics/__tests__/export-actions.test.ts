jest.mock("@/lib/auth/session", () => ({ getCurrentSession: jest.fn() }));
jest.mock("@/lib/authz/can", () => ({ can: jest.fn() }));
jest.mock("@/lib/jobs/enqueue", () => ({ enqueue: jest.fn().mockResolvedValue("queued-id") }));
jest.mock("@/lib/db/admin", () => ({
  dbAdmin: {
    insert: jest.fn(() => ({
      values: jest.fn(() => ({ returning: jest.fn().mockResolvedValue([{ id: "job-1" }]) })),
    })),
  },
}));

import { requestAnalyticsExport } from "../export-actions";
import { getCurrentSession } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { enqueue } from "@/lib/jobs/enqueue";

const session = { userId: "u-1", userEmail: "u-1@example.com", profile: { id: "u-1", role: "restaurant_owner", locale: "ro", defaultOrganizationId: null } };
const ORG = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("requestAnalyticsExport", () => {
  beforeEach(() => jest.clearAllMocks());

  test("rejects when not signed in", async () => {
    (getCurrentSession as jest.Mock).mockResolvedValue(null);
    const r = await requestAnalyticsExport({ organizationId: ORG } as never);
    expect(r.ok).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  test("rejects without analytics.export", async () => {
    (getCurrentSession as jest.Mock).mockResolvedValue(session);
    (can as jest.Mock).mockResolvedValue(false);
    const r = await requestAnalyticsExport({ organizationId: ORG } as never);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Forbidden.");
  });

  test("rejects campaigns export without campaigns.read", async () => {
    (getCurrentSession as jest.Mock).mockResolvedValue(session);
    // analytics.export allowed, campaigns.read denied.
    (can as jest.Mock).mockImplementation(async (_s, action: string) => action === "analytics.export"); // campaign.read denied
    const r = await requestAnalyticsExport({ organizationId: ORG, tables: ["campaigns"] } as never);
    expect(r.ok).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  test("happy path creates a job and enqueues run-export", async () => {
    (getCurrentSession as jest.Mock).mockResolvedValue(session);
    (can as jest.Mock).mockResolvedValue(true);
    const r = await requestAnalyticsExport({ organizationId: ORG, tables: ["reservations"] } as never);
    expect(r).toEqual({ ok: true, jobId: "job-1" });
    expect(enqueue).toHaveBeenCalledWith("analytics.run-export", { jobId: "job-1" });
  });
});
