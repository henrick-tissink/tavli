/**
 * @jest-environment node
 *
 * The post-visit sweep moved to the pg-boss job
 * (send-post-visit-reviews.test.ts covers the sweep/claim/release logic). This
 * route is now a thin CRON_SECRET-guarded delegate — these tests cover the auth
 * gate + that an authorized call delegates to the job.
 */
jest.mock("@/lib/reservations/jobs/send-post-visit-reviews", () => ({
  sendPostVisitReviews: jest.fn().mockResolvedValue({ sent: 3 }),
}));

import { POST } from "@/app/api/cron/post-visit-emails/route";
import { sendPostVisitReviews } from "@/lib/reservations/jobs/send-post-visit-reviews";

const OLD_ENV = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  (sendPostVisitReviews as jest.Mock).mockResolvedValue({ sent: 3 });
  process.env = {
    ...OLD_ENV,
    CRON_SECRET: "test-secret",
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
  };
});
afterEach(() => {
  process.env = OLD_ENV;
});

function req(auth?: string): Request {
  return new Request("http://localhost/api/cron/post-visit-emails", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

describe("POST /api/cron/post-visit-emails (delegate)", () => {
  it("401s without the CRON_SECRET bearer", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(sendPostVisitReviews).not.toHaveBeenCalled();
  });

  it("401s on a wrong secret", async () => {
    const res = await POST(req("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(sendPostVisitReviews).not.toHaveBeenCalled();
  });

  it("delegates to the job + returns the sent count when authorized", async () => {
    const res = await POST(req("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(sendPostVisitReviews).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual({ ok: true, sent: 3 });
  });
});
