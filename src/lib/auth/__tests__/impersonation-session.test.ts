import { randomBytes } from "node:crypto";

jest.mock("@/lib/audit/record", () => ({
  recordAudit: jest.fn(),
}));

const KEY = randomBytes(32).toString("base64");
process.env.IMPERSONATION_COOKIE_SECRET = KEY;

import { startImpersonationSession } from "../impersonation-session";
import { recordAudit } from "@/lib/audit/record";

function buildSupabaseMock(opts: {
  user?: { id: string; email: string } | null;
  profileRole?: string;
  currentAALLevel?: "aal1" | "aal2";
  sessionTokens?: { access_token: string; refresh_token: string } | null;
  signOutOk?: boolean;
  verifyOtpOk?: boolean;
  setSessionOk?: boolean;
} = {}) {
  const u = opts.user === undefined ? { id: "admin", email: "a@x" } : opts.user;
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: u } }),
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: opts.sessionTokens ?? { access_token: "AT", refresh_token: "RT" },
        },
      }),
      signOut: jest.fn().mockResolvedValue({}),
      verifyOtp: jest
        .fn()
        .mockResolvedValue(
          opts.verifyOtpOk === false
            ? { error: { message: "expired" } }
            : { error: null },
        ),
      setSession: jest.fn().mockResolvedValue({
        error: opts.setSessionOk === false ? { message: "stale" } : null,
      }),
      mfa: {
        getAuthenticatorAssuranceLevel: jest.fn().mockResolvedValue({
          data: { currentLevel: opts.currentAALLevel ?? "aal2" },
        }),
      },
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest
            .fn()
            .mockResolvedValue({ data: { role: opts.profileRole ?? "admin" } }),
        }),
      }),
    }),
  };
}

function buildAdminClientMock(target: { id: string; email: string } | null = {
  id: "target",
  email: "t@x",
}) {
  return {
    auth: {
      admin: {
        getUserById: jest.fn().mockResolvedValue({
          data: { user: target },
        }),
        generateLink: jest.fn().mockResolvedValue({
          data: { properties: { hashed_token: "hash" } },
        }),
      },
    },
  };
}

function buildCookieStore() {
  const store = new Map<string, string>();
  return {
    set: jest.fn((name: string, value: string) => store.set(name, value)),
    delete: jest.fn((name: string) => store.delete(name)),
    get: jest.fn((name: string) => {
      const v = store.get(name);
      return v ? { value: v } : undefined;
    }),
    _store: store,
  };
}

describe("startImpersonationSession", () => {
  beforeEach(() => (recordAudit as jest.Mock).mockClear());

  it("rejects when caller is not admin", async () => {
    const supabase = buildSupabaseMock({ profileRole: "restaurant_owner" });
    const adminClient = buildAdminClientMock();
    const cookieStore = buildCookieStore();

    await expect(
      startImpersonationSession("target", undefined, {
        supabase: supabase as never,
        adminClient: adminClient as never,
        cookieStore: cookieStore as never,
      }),
    ).rejects.toThrow(/admin role/i);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("rejects when caller is not AAL2", async () => {
    const supabase = buildSupabaseMock({ currentAALLevel: "aal1" });
    const adminClient = buildAdminClientMock();
    const cookieStore = buildCookieStore();

    await expect(
      startImpersonationSession("target", undefined, {
        supabase: supabase as never,
        adminClient: adminClient as never,
        cookieStore: cookieStore as never,
      }),
    ).rejects.toThrow(/aal2/i);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("rejects self-impersonation", async () => {
    const supabase = buildSupabaseMock();
    const adminClient = buildAdminClientMock();
    const cookieStore = buildCookieStore();

    await expect(
      startImpersonationSession("admin", undefined, {
        supabase: supabase as never,
        adminClient: adminClient as never,
        cookieStore: cookieStore as never,
      }),
    ).rejects.toThrow(/self-impersonation/i);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("rejects when target user not found", async () => {
    const supabase = buildSupabaseMock();
    const adminClient = buildAdminClientMock(null);
    const cookieStore = buildCookieStore();

    await expect(
      startImpersonationSession("missing", undefined, {
        supabase: supabase as never,
        adminClient: adminClient as never,
        cookieStore: cookieStore as never,
      }),
    ).rejects.toThrow(/target user not found/i);
  });

  it("happy path: signs out admin, verifies otp, audits, sets cookie", async () => {
    const supabase = buildSupabaseMock();
    const adminClient = buildAdminClientMock();
    const cookieStore = buildCookieStore();

    let redirectedTo: string | null = null;
    try {
      await startImpersonationSession("target", "support reason", {
        supabase: supabase as never,
        adminClient: adminClient as never,
        cookieStore: cookieStore as never,
      });
    } catch (e: unknown) {
      // Next's redirect throws — capture URL from error if present
      const msg = (e as Error).message ?? "";
      if (/NEXT_REDIRECT/i.test(msg) || msg.includes("/partner")) {
        redirectedTo = msg;
      } else {
        throw e;
      }
    }

    expect(cookieStore.delete).toHaveBeenCalledWith("tavli_active_org");
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash",
      type: "magiclink",
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.impersonation_started",
        subjectId: "target",
        actorUserId: "admin",
        impersonatorUserId: "admin",
      }),
    );
    expect(cookieStore.set).toHaveBeenCalledWith(
      "tavli_impersonation_return",
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: "strict",
      }),
    );
  });

  it("restores admin session when verifyOtp fails post-signOut", async () => {
    const supabase = buildSupabaseMock({ verifyOtpOk: false });
    const adminClient = buildAdminClientMock();
    const cookieStore = buildCookieStore();

    await expect(
      startImpersonationSession("target", undefined, {
        supabase: supabase as never,
        adminClient: adminClient as never,
        cookieStore: cookieStore as never,
      }),
    ).rejects.toThrow(/swap failed/i);

    // Admin session restored before throw
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: "AT",
      refresh_token: "RT",
    });
    // No audit, no cookie write
    expect(recordAudit).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("audits only after swap succeeds", async () => {
    const supabase = buildSupabaseMock({ verifyOtpOk: false });
    const adminClient = buildAdminClientMock();
    const cookieStore = buildCookieStore();

    await expect(
      startImpersonationSession("target", "reason", {
        supabase: supabase as never,
        adminClient: adminClient as never,
        cookieStore: cookieStore as never,
      }),
    ).rejects.toThrow();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
