/**
 * MFA helper tests — structural mocks of the Supabase Auth MFA surface.
 *
 * The wrappers in `mfa.ts` call recordAudit on side-effectful operations
 * (verify, unenrol). We mock the audit helper to verify it's called
 * with the right payload, NOT to mock the DB write — the real recordAudit
 * is exercised by its own tests.
 */

jest.mock("@/lib/audit/record", () => ({
  recordAudit: jest.fn(),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enrolTotpFactor,
  verifyTotpEnrollment,
  unenrollFactor,
  listVerifiedTotpFactors,
} from "../mfa";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";

function mockSupabase(
  mfa: Partial<{
    enroll: jest.Mock;
    challenge: jest.Mock;
    verify: jest.Mock;
    unenroll: jest.Mock;
    listFactors: jest.Mock;
  }>,
): SupabaseClient {
  return {
    auth: {
      mfa: {
        enroll: mfa.enroll ?? jest.fn(),
        challenge: mfa.challenge ?? jest.fn(),
        verify: mfa.verify ?? jest.fn(),
        unenroll: mfa.unenroll ?? jest.fn(),
        listFactors: mfa.listFactors ?? jest.fn(),
      },
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  (recordAudit as jest.Mock).mockClear();
});

describe("enrolTotpFactor", () => {
  it("returns the factor + QR/secret on success", async () => {
    const supabase = mockSupabase({
      enroll: jest.fn().mockResolvedValue({
        data: {
          id: "factor-1",
          totp: {
            qr_code: "<svg>...</svg>",
            uri: "otpauth://totp/Tavli:u1?secret=ABC&issuer=Tavli",
            secret: "ABCDEF234567",
          },
        },
        error: null,
      }),
    });
    const result = await enrolTotpFactor(supabase, "My phone");
    expect(result).toEqual({
      ok: true,
      factorId: "factor-1",
      qrCodeSvg: "<svg>...</svg>",
      uri: "otpauth://totp/Tavli:u1?secret=ABC&issuer=Tavli",
      secret: "ABCDEF234567",
    });
  });

  it("returns ok:false on Supabase error", async () => {
    const supabase = mockSupabase({
      enroll: jest.fn().mockResolvedValue({
        data: null,
        error: { message: "Rate limited" },
      }),
    });
    const result = await enrolTotpFactor(supabase);
    expect(result).toEqual({ ok: false, error: "Rate limited" });
  });
});

describe("verifyTotpEnrollment", () => {
  it("challenges, verifies, and audits mfa_enrolled on success", async () => {
    const supabase = mockSupabase({
      challenge: jest.fn().mockResolvedValue({ data: { id: "challenge-1" }, error: null }),
      verify: jest.fn().mockResolvedValue({
        data: { access_token: "tok", refresh_token: "tok2" },
        error: null,
      }),
    });
    const result = await verifyTotpEnrollment(supabase, "factor-1", "123456", "user-1");
    expect(result).toEqual({ ok: true });
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT.auth.mfa_enrolled,
        subjectType: "user",
        subjectId: "user-1",
        actorUserId: "user-1",
        actorRole: "venue_owner",
        context: { factor_type: "totp", factor_id: "factor-1" },
      }),
    );
  });

  it("returns error and does NOT audit when the code is invalid", async () => {
    const supabase = mockSupabase({
      challenge: jest.fn().mockResolvedValue({ data: { id: "challenge-1" }, error: null }),
      verify: jest.fn().mockResolvedValue({
        data: null,
        error: { message: "Invalid TOTP code" },
      }),
    });
    const result = await verifyTotpEnrollment(supabase, "factor-1", "000000", "user-1");
    expect(result).toEqual({ ok: false, error: "Invalid TOTP code" });
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("unenrollFactor", () => {
  it("audits mfa_disabled on success", async () => {
    const supabase = mockSupabase({
      unenroll: jest.fn().mockResolvedValue({ data: {}, error: null }),
    });
    const result = await unenrollFactor(supabase, "factor-1", "user-1");
    expect(result).toEqual({ ok: true });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT.auth.mfa_disabled,
        subjectType: "user",
        subjectId: "user-1",
        actorUserId: "user-1",
        actorRole: "venue_owner",
        context: { factor_id: "factor-1" },
      }),
    );
  });

  it("does NOT audit when Supabase rejects the unenroll", async () => {
    const supabase = mockSupabase({
      unenroll: jest.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
    });
    const result = await unenrollFactor(supabase, "factor-1", "user-1");
    expect(result).toEqual({ ok: false, error: "Not found" });
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("listVerifiedTotpFactors", () => {
  it("filters out unverified factors and returns the verified TOTP set", async () => {
    const supabase = mockSupabase({
      listFactors: jest.fn().mockResolvedValue({
        data: {
          totp: [
            {
              id: "f1",
              friendly_name: "Yubico",
              status: "verified",
              created_at: "2026-05-22T00:00:00Z",
            },
            {
              id: "f2",
              friendly_name: null,
              status: "unverified",
              created_at: "2026-05-22T00:00:01Z",
            },
          ],
          phone: [],
          all: [],
        },
        error: null,
      }),
    });
    const result = await listVerifiedTotpFactors(supabase);
    expect(result).toEqual([
      {
        id: "f1",
        friendlyName: "Yubico",
        status: "verified",
        createdAt: "2026-05-22T00:00:00Z",
      },
    ]);
  });
});
