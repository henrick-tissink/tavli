/**
 * @jest-environment node
 *
 * Proxy gate tests (§01 §5a.2 phase 2 / §5a.3 phase 2).
 *
 * Exercises the five gates introduced in phase 2:
 *   1. next-action bypass (server-action POSTs pass through)
 *   2. role + sign-in redirects for /admin/* + /partner/*
 *   3. admin forced-enrolment redirect (AAL1 nextLevel=aal1, no factor yet)
 *   4. AAL2 step-up redirect (AAL1 nextLevel=aal2, factor present, not impersonating)
 *   5. impersonation AAL bypass + dangling-cookie cleanup
 *
 * createServerClient, next/headers cookies, and the impersonation cookie
 * reader are mocked so we can drive each branch without hitting real
 * Supabase / cookie state. We force the node environment because next/server
 * relies on Web fetch/Request globals that jsdom doesn't provide.
 */

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(),
}));

jest.mock("@/lib/auth/impersonation-cookie", () => ({
  readImpersonationReturnCookie: jest.fn(),
  IMPERSONATION_COOKIE_NAME: "tavli_impersonation_return",
}));

import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { readImpersonationReturnCookie } from "@/lib/auth/impersonation-cookie";
import { proxy } from "../proxy";

interface MockRequestOpts {
  pathname?: string;
  nextAction?: string | null;
}

function mockRequest(opts: MockRequestOpts = {}): NextRequest {
  const url = `http://localhost${opts.pathname ?? "/"}`;
  const headers = new Headers();
  if (opts.nextAction) headers.set("next-action", opts.nextAction);
  return new NextRequest(url, { headers });
}

interface MockSupabaseOpts {
  user?: { id: string; email: string } | null;
  profileRole?: string | null;
  currentLevel?: "aal1" | "aal2";
  nextLevel?: "aal1" | "aal2";
}

function mockSupabase(opts: MockSupabaseOpts) {
  return {
    auth: {
      getUser: jest
        .fn()
        .mockResolvedValue({ data: { user: opts.user ?? null } }),
      mfa: {
        getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
          data: {
            currentLevel: opts.currentLevel ?? "aal1",
            nextLevel: opts.nextLevel ?? "aal1",
          },
        }),
      },
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: opts.profileRole ? { role: opts.profileRole } : null,
          }),
        }),
      }),
    }),
  };
}

const impersonationPayload = {
  v: 1 as const,
  adminUserId: "admin",
  adminEmail: "a@x",
  targetUserId: "t",
  targetEmail: "t@x",
  startedAt: "2026-05-22T10:00:00Z",
  adminAccessToken: "AT",
  adminRefreshToken: "RT",
};

describe("proxy", () => {
  beforeEach(() => {
    (createServerClient as jest.Mock).mockReset();
    (readImpersonationReturnCookie as jest.Mock).mockReset();
    (readImpersonationReturnCookie as jest.Mock).mockResolvedValue(null);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  });

  it("passes through when env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const req = mockRequest({ pathname: "/admin/users" });
    const res = await proxy(req);
    expect(createServerClient).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBeNull();
  });

  it("bypasses all gates when next-action header is set", async () => {
    const req = mockRequest({
      pathname: "/admin/users",
      nextAction: "some-action-id",
    });
    const res = await proxy(req);
    expect(createServerClient).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBeNull();
  });

  it("passes through non-admin/partner/public routes without auth checks", async () => {
    const req = mockRequest({ pathname: "/" });
    const res = await proxy(req);
    expect(createServerClient).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects /admin/* to /admin/sign-in when no user", async () => {
    const sb = mockSupabase({ user: null });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/admin/users" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toMatch(/\/admin\/sign-in$/);
  });

  it("redirects /admin/* to /admin/sign-in when user lacks admin role", async () => {
    const sb = mockSupabase({
      user: { id: "u", email: "u@x" },
      profileRole: "restaurant_owner",
    });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/admin/users" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toMatch(/\/admin\/sign-in$/);
  });

  it("forces admin enrolment when no verified factor (nextLevel=aal1)", async () => {
    const sb = mockSupabase({
      user: { id: "admin", email: "a@x" },
      profileRole: "admin",
      currentLevel: "aal1",
      nextLevel: "aal1",
    });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/admin/users" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toMatch(
      /\/admin\/security\?enrol=required/,
    );
  });

  it("does NOT force enrolment when admin is already on /admin/security", async () => {
    const sb = mockSupabase({
      user: { id: "admin", email: "a@x" },
      profileRole: "admin",
      currentLevel: "aal1",
      nextLevel: "aal1",
    });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/admin/security" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects admin AAL1+factor to /admin/sign-in?continue_mfa=1", async () => {
    const sb = mockSupabase({
      user: { id: "admin", email: "a@x" },
      profileRole: "admin",
      currentLevel: "aal1",
      nextLevel: "aal2",
    });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/admin/users" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toMatch(
      /\/admin\/sign-in\?continue_mfa=1/,
    );
  });

  it("redirects partner AAL1+factor to /partner/sign-in?continue_mfa=1", async () => {
    const sb = mockSupabase({
      user: { id: "p", email: "p@x" },
      profileRole: "restaurant_owner",
      currentLevel: "aal1",
      nextLevel: "aal2",
    });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/partner/reservations" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toMatch(
      /\/partner\/sign-in\?continue_mfa=1/,
    );
  });

  it("bypasses AAL2 gate when impersonating", async () => {
    (readImpersonationReturnCookie as jest.Mock).mockResolvedValue(
      impersonationPayload,
    );
    const sb = mockSupabase({
      user: { id: "t", email: "t@x" },
      profileRole: "restaurant_owner",
      currentLevel: "aal1",
      nextLevel: "aal2",
    });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/partner/reservations" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("cleans up dangling cookie when impersonating but no user session", async () => {
    (readImpersonationReturnCookie as jest.Mock).mockResolvedValue(
      impersonationPayload,
    );
    const sb = mockSupabase({ user: null });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/admin/users" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toMatch(/session_expired=1/);
    // Cookie should be deleted on the response (Max-Age=0 or empty-value form).
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/tavli_impersonation_return/);
    expect(setCookie).toMatch(/Max-Age=0|tavli_impersonation_return=;/);
  });

  it("allows AAL2 admin onto /admin/*", async () => {
    const sb = mockSupabase({
      user: { id: "admin", email: "a@x" },
      profileRole: "admin",
      currentLevel: "aal2",
      nextLevel: "aal2",
    });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/admin/users" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects /partner/* to sign-in when no user", async () => {
    const sb = mockSupabase({ user: null });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/partner/reservations" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toMatch(/\/partner\/sign-in$/);
  });

  it("redirects /partner/* to sign-in when user is neither owner nor admin", async () => {
    const sb = mockSupabase({
      user: { id: "u", email: "u@x" },
      profileRole: "consumer",
    });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/partner/reservations" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toMatch(/\/partner\/sign-in$/);
  });

  it("allows admin onto /partner/* (admin can access partner routes)", async () => {
    const sb = mockSupabase({
      user: { id: "admin", email: "a@x" },
      profileRole: "admin",
      currentLevel: "aal2",
      nextLevel: "aal2",
    });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/partner/reservations" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });

  it("/admin/sign-in is public — no redirect when unauthenticated", async () => {
    const sb = mockSupabase({ user: null });
    (createServerClient as jest.Mock).mockReturnValue(sb);
    const req = mockRequest({ pathname: "/admin/sign-in" });
    const res = await proxy(req);
    expect(res.headers.get("location")).toBeNull();
  });
});
