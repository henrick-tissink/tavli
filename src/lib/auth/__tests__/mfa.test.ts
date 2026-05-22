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

// ─── Recovery codes (§01 §5a.2 phase 2) ──────────────────────────────────

jest.mock("@/lib/db/admin", () => ({
  dbAdmin: {
    transaction: jest.fn(),
    select: jest.fn(),
  },
  createSupabaseAdminClient: jest.fn(),
}));

jest.mock("@/lib/auth/current-actor", () => ({
  currentActor: jest.fn().mockResolvedValue({
    actorUserId: "user-1",
    impersonatorUserId: null,
  }),
}));

import { dbAdmin } from "@/lib/db/admin";
import { currentActor } from "@/lib/auth/current-actor";
import {
  generateRecoveryCodes,
  countUnconsumedRecoveryCodes,
  RECOVERY_CODE_COUNT,
  RECOVERY_CODE_LENGTH,
} from "../mfa";

describe("generateRecoveryCodes", () => {
  beforeEach(() => {
    (recordAudit as jest.Mock).mockClear();
    (dbAdmin.transaction as jest.Mock).mockReset();
    (currentActor as jest.Mock).mockResolvedValue({
      actorUserId: "user-1",
      impersonatorUserId: null,
    });
  });

  it("generates RECOVERY_CODE_COUNT codes of RECOVERY_CODE_LENGTH chars from the safe alphabet", async () => {
    const valuesFn = jest.fn().mockResolvedValue(undefined);
    const insertFn = jest.fn().mockReturnValue({ values: valuesFn });
    const whereFn = jest.fn().mockResolvedValue(undefined);
    const deleteFn = jest.fn().mockReturnValue({ where: whereFn });
    const tx = { delete: deleteFn, insert: insertFn };
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));

    const codes = await generateRecoveryCodes("user-1");
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    for (const display of codes) {
      const raw = display.replace(/-/g, "");
      expect(raw).toHaveLength(RECOVERY_CODE_LENGTH);
      expect(raw).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]+$/);
      // Display format: xxxx-xxxx-xx (10 chars + 2 dashes = 12)
      expect(display).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{2}$/);
    }
  });

  it("deletes existing rows + inserts new hashed rows in a single transaction", async () => {
    const valuesFn = jest.fn().mockResolvedValue(undefined);
    const insertFn = jest.fn().mockReturnValue({ values: valuesFn });
    const whereFn = jest.fn().mockResolvedValue(undefined);
    const deleteFn = jest.fn().mockReturnValue({ where: whereFn });
    const tx = { delete: deleteFn, insert: insertFn };
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));

    await generateRecoveryCodes("user-1");

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(insertFn).toHaveBeenCalledTimes(1);
    const inserted = (valuesFn as jest.Mock).mock.calls[0][0];
    expect(inserted).toHaveLength(RECOVERY_CODE_COUNT);
    for (const row of inserted) {
      expect(row.userId).toBe("user-1");
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("writes audit row with impersonator threading via currentActor", async () => {
    const tx = {
      delete: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      insert: jest.fn().mockReturnValue({ values: jest.fn().mockResolvedValue(undefined) }),
    };
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));
    (currentActor as jest.Mock).mockResolvedValueOnce({
      actorUserId: "user-1",
      impersonatorUserId: "admin-1",
    });

    await generateRecoveryCodes("user-1");

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AUDIT.user.mfa_recovery_codes_regenerated,
        subjectType: "user",
        subjectId: "user-1",
        actorUserId: "user-1",
        impersonatorUserId: "admin-1",
      }),
    );
  });
});

describe("countUnconsumedRecoveryCodes", () => {
  it("returns the count from dbAdmin", async () => {
    const whereFn = jest.fn().mockResolvedValue([{ count: 7 }]);
    const fromFn = jest.fn().mockReturnValue({ where: whereFn });
    const selectFn = jest.fn().mockReturnValue({ from: fromFn });
    (dbAdmin as unknown as { select: jest.Mock }).select = selectFn;

    const result = await countUnconsumedRecoveryCodes("user-1");
    expect(result).toBe(7);
  });

  it("returns 0 when no rows", async () => {
    const whereFn = jest.fn().mockResolvedValue([]);
    const fromFn = jest.fn().mockReturnValue({ where: whereFn });
    const selectFn = jest.fn().mockReturnValue({ from: fromFn });
    (dbAdmin as unknown as { select: jest.Mock }).select = selectFn;

    const result = await countUnconsumedRecoveryCodes("user-1");
    expect(result).toBe(0);
  });
});

// ─── consumeRecoveryCode (§01 §5a.2 phase 2) ─────────────────────────────

import { consumeRecoveryCode } from "../mfa";

describe("consumeRecoveryCode", () => {
  beforeEach(() => {
    (recordAudit as jest.Mock).mockClear();
    (dbAdmin.transaction as jest.Mock).mockReset();
    (currentActor as jest.Mock).mockResolvedValue({
      actorUserId: "user-1",
      impersonatorUserId: null,
    });
  });

  function mockAdminClient(factors: Array<{ id: string }>) {
    const listFactors = jest.fn().mockResolvedValue({
      data: {
        factors: factors.map((f) => ({ ...f, factor_type: "totp" })),
      },
      error: null,
    });
    const deleteFactor = jest.fn().mockResolvedValue({ error: null });
    return {
      auth: {
        admin: {
          mfa: { listFactors, deleteFactor },
        },
      },
      listFactors,
      deleteFactor,
    };
  }

  function mockCountSelect(count: number) {
    const whereFn = jest.fn().mockResolvedValue([{ count }]);
    const fromFn = jest.fn().mockReturnValue({ where: whereFn });
    (dbAdmin as unknown as { select: jest.Mock }).select = jest
      .fn()
      .mockReturnValue({ from: fromFn });
  }

  it("returns ok=false when input length is wrong", async () => {
    const ac = mockAdminClient([]);
    const result = await consumeRecoveryCode(
      "user-1",
      "too-short",
      ac as never,
    );
    expect(result).toEqual({ ok: false });
    expect(dbAdmin.transaction).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("returns ok=false when no matching unconsumed row", async () => {
    const ac = mockAdminClient([]);
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) =>
      cb({
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    );
    const result = await consumeRecoveryCode(
      "user-1",
      "abcd-efgh-jk", // 10 chars + 2 dashes
      ac as never,
    );
    expect(result).toEqual({ ok: false });
    expect(recordAudit).not.toHaveBeenCalled();
    expect(ac.deleteFactor).not.toHaveBeenCalled();
  });

  it("consumes the row, unenrols all factors, audits per factor + once for code consumption", async () => {
    const ac = mockAdminClient([{ id: "f1" }, { id: "f2" }]);
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) =>
      cb({
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ id: "row-id" }]),
            }),
          }),
        }),
      }),
    );
    mockCountSelect(9);

    const result = await consumeRecoveryCode("user-1", "abcd-efgh-jk", ac as never);
    expect(result).toEqual({ ok: true, remaining: 9 });
    expect(ac.deleteFactor).toHaveBeenCalledTimes(2);
    expect(ac.deleteFactor).toHaveBeenCalledWith({ userId: "user-1", id: "f1" });
    expect(ac.deleteFactor).toHaveBeenCalledWith({ userId: "user-1", id: "f2" });

    // mfa_disabled audit per factor + mfa_recovery_code_consumed once
    const calls = (recordAudit as jest.Mock).mock.calls.map((c) => c[0].action);
    expect(calls.filter((a) => a === AUDIT.auth.mfa_disabled)).toHaveLength(2);
    expect(calls.filter((a) => a === AUDIT.user.mfa_recovery_code_consumed)).toHaveLength(1);
  });

  it("threads currentActor's impersonatorUserId on the consumption audit row", async () => {
    const ac = mockAdminClient([]);
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) =>
      cb({
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              returning: jest.fn().mockResolvedValue([{ id: "row-id" }]),
            }),
          }),
        }),
      }),
    );
    mockCountSelect(5);
    (currentActor as jest.Mock).mockResolvedValueOnce({
      actorUserId: "user-1",
      impersonatorUserId: "admin-1",
    });

    await consumeRecoveryCode("user-1", "abcd-efgh-jk", ac as never);

    const consumeCall = (recordAudit as jest.Mock).mock.calls.find(
      (c) => c[0].action === AUDIT.user.mfa_recovery_code_consumed,
    );
    expect(consumeCall).toBeDefined();
    expect(consumeCall[0]).toMatchObject({
      actorUserId: "user-1",
      impersonatorUserId: "admin-1",
    });
  });
});
