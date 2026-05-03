/**
 * @jest-environment node
 */

import { POST } from "@/app/api/cron/post-visit-emails/route";

jest.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: jest.fn(),
}));
jest.mock("@/lib/email/resend", () => ({
  sendEmail: jest.fn().mockResolvedValue({ ok: true }),
}));

import { createSupabaseAdminClient } from "@/lib/db/admin";
import { sendEmail } from "@/lib/email/resend";

const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetAllMocks();
  // Restore default sendEmail behaviour after resetAllMocks clears the factory impl.
  (sendEmail as jest.Mock).mockResolvedValue({ ok: true });
  process.env = {
    ...OLD_ENV,
    CRON_SECRET: "test-secret",
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    NEXT_PUBLIC_APP_URL: "https://tavli.ro",
  };
});

afterEach(() => {
  process.env = OLD_ENV;
});

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/post-visit-emails", {
    method: "POST",
    headers,
  });
}

describe("POST /api/cron/post-visit-emails", () => {
  test("rejects without bearer token", async () => {
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  test("rejects with wrong bearer token", async () => {
    const res = await POST(makeReq({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  test("returns 500 when supabase env not set", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const res = await POST(
      makeReq({ authorization: "Bearer test-secret" }),
    );
    expect(res.status).toBe(500);
  });

  test("sends email + updates sent_at for each eligible reservation", async () => {
    const longAgo = new Date(Date.now() - 6 * 3600_000)
      .toISOString()
      .slice(0, 10);
    const oldTime = new Date(Date.now() - 6 * 3600_000)
      .toISOString()
      .slice(11, 19);
    const candidates = [
      {
        id: "res-1",
        confirmation_token: "tok-1",
        restaurant_id: "rest-1",
        guest_name: "Ana Pop",
        guest_email: "ana@example.com",
        reservation_date: longAgo,
        reservation_time: oldTime,
        restaurants: { name: "Roma" },
      },
    ];

    const updateEq = jest.fn().mockResolvedValue({ data: null, error: null });
    const update = jest.fn(() => ({ eq: updateEq }));

    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.is = jest.fn(() => chain);
    chain.not = jest.fn(() => chain);
    chain.lte = jest.fn(() => chain);
    chain.gte = jest.fn().mockResolvedValue({ data: candidates, error: null });

    (createSupabaseAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((tbl: string) => {
        if (tbl === "reservations") {
          return Object.assign({}, chain, { update });
        }
        return chain;
      }),
    });

    const res = await POST(
      makeReq({ authorization: "Bearer test-secret" }),
    );
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ post_visit_email_sent_at: expect.any(String) }),
    );
    expect(updateEq).toHaveBeenCalledWith("id", "res-1");
  });
});
