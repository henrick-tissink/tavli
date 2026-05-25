/**
 * @jest-environment node
 *
 * pseudonymiseDiner — Wave 3 §03 §5.1 / §7 / §8.2 sub-unit D.3.
 * Drives a mocked transactional executor to verify the 4-table cascade
 * order (diners → reservations → reviews → transactional_email_log →
 * erasure_log) and the two-audit-row tail (`diner.pseudonymised` +
 * `compliance.erasure_executed`) with impersonator threading and role
 * defaulting.
 */

jest.mock("@/lib/audit/record", () => ({
  recordAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/db/admin", () => ({
  dbAdmin: {
    transaction: jest.fn(),
  },
  createSupabaseAdminClient: jest.fn(),
}));

import { dbAdmin } from "@/lib/db/admin";
import { recordAudit } from "@/lib/audit/record";
import { AUDIT } from "@/lib/audit/actions";
import { reservations, reviews } from "@/lib/db/schema";
import {
  makePseudonymiseDiner,
  REDACTED_DINER_COLUMNS,
  REDACTED_PLACEHOLDER,
  REDACTED_PHONE_PLACEHOLDER,
} from "../pseudonymise";

/**
 * Build a fake `tx` executor that records every update/insert call in order.
 * Each chained `.set(...).where(...)` resolves to undefined; insert chains
 * `.values(...)` likewise.
 */
function makeTx() {
  const calls: Array<{ op: string; table: unknown; args: unknown }> = [];
  // select mock for the idempotency guard: returns redactedAt: null so the
  // transaction body proceeds (happy-path / first-call behaviour).
  const select = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        for: jest.fn().mockResolvedValue([{ redactedAt: null }]),
      }),
    }),
  });
  const update = jest.fn((table) => {
    const builder = {
      set: jest.fn((args) => {
        calls.push({ op: "update", table, args });
        return {
          where: jest.fn().mockResolvedValue(undefined),
        };
      }),
    };
    return builder;
  });
  const insert = jest.fn((table) => {
    return {
      values: jest.fn((args) => {
        calls.push({ op: "insert", table, args });
        return Promise.resolve(undefined);
      }),
    };
  });
  // F11: review_revisions redaction runs via tx.execute(sql`...`); a no-op that
  // is NOT recorded in `calls`, so the ordered update/insert assertions hold.
  const execute = jest.fn(() => Promise.resolve([]));
  return { tx: { select, update, insert, execute }, calls };
}

beforeEach(() => {
  (recordAudit as jest.Mock).mockClear();
  (dbAdmin.transaction as jest.Mock).mockReset();
});

describe("pseudonymiseDiner", () => {
  it("runs the 5 mutations in order: diners → reservations → reviews → transactional_email_log → erasure_log", async () => {
    const { tx, calls } = makeTx();
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));

    const fn = makePseudonymiseDiner({ db: dbAdmin });
    await fn({
      dinerId: "diner-1",
      reason: "owner_request",
      actorUserId: "user-1",
    });

    // Five mutations total: 4 updates + 1 insert.
    expect(calls).toHaveLength(5);
    expect(calls[0].op).toBe("update"); // diners
    expect(calls[1].op).toBe("update"); // reservations
    expect(calls[2].op).toBe("update"); // reviews
    expect(calls[3].op).toBe("update"); // transactional_email_log
    expect(calls[4].op).toBe("insert"); // erasure_log
  });

  it("nulls diner PII columns and sets redacted_at + updated_at", async () => {
    const { tx, calls } = makeTx();
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));

    const fn = makePseudonymiseDiner({ db: dbAdmin });
    await fn({
      dinerId: "diner-1",
      reason: "owner_request",
      actorUserId: "user-1",
    });

    const dinerSet = calls[0].args as Record<string, unknown>;
    expect(dinerSet.phone).toBeNull();
    expect(dinerSet.phoneRaw).toBeNull();
    expect(dinerSet.email).toBeNull();
    expect(dinerSet.fullName).toBeNull();
    expect(dinerSet.internalNotes).toBeNull();
    expect(dinerSet.allergies).toEqual([]);
    expect(dinerSet.occasionTags).toEqual([]);
    expect(dinerSet.seatingPreferences).toEqual({});
    expect(dinerSet.dietaryPreferences).toEqual([]);
    expect(dinerSet.birthdayDate).toBeNull();
    expect(dinerSet.anniversaryDate).toBeNull();
    expect(dinerSet.redactedAt).toBeInstanceOf(Date);
    expect(dinerSet.updatedAt).toBeInstanceOf(Date);
  });

  it("replaces reservation guest_name + guest_phone with placeholders, nulls guest_email (guest_name/phone are NOT NULL in schema)", async () => {
    const { tx, calls } = makeTx();
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));

    const fn = makePseudonymiseDiner({ db: dbAdmin });
    await fn({
      dinerId: "diner-1",
      reason: "owner_request",
      actorUserId: "user-1",
    });

    const resSet = calls[1].args as Record<string, unknown>;
    expect(resSet).toMatchObject({
      guestName: REDACTED_PLACEHOLDER,
      guestPhone: REDACTED_PHONE_PLACEHOLDER,
      guestEmail: null,
    });
    // redacted_at is also stamped on cascade rows (Wave 4 T4)
    expect(resSet.redactedAt).toBeInstanceOf(Date);
  });

  it("replaces reviews.firstName with the redaction placeholder (first_name is NOT NULL in schema)", async () => {
    const { tx, calls } = makeTx();
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));

    const fn = makePseudonymiseDiner({ db: dbAdmin });
    await fn({
      dinerId: "diner-1",
      reason: "owner_request",
      actorUserId: "user-1",
    });

    const reviewSet = calls[2].args as Record<string, unknown>;
    expect(reviewSet).toMatchObject({ firstName: REDACTED_PLACEHOLDER });
    // redacted_at is also stamped on cascade rows (Wave 4 T4)
    expect(reviewSet.redactedAt).toBeInstanceOf(Date);
  });

  it("nulls transactional_email_log email + phone and stamps redacted_at", async () => {
    const { tx, calls } = makeTx();
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));

    const fn = makePseudonymiseDiner({ db: dbAdmin });
    await fn({
      dinerId: "diner-1",
      reason: "owner_request",
      actorUserId: "user-1",
    });

    const logSet = calls[3].args as Record<string, unknown>;
    expect(logSet.email).toBeNull();
    expect(logSet.phone).toBeNull();
    expect(logSet.redactedAt).toBeInstanceOf(Date);
  });

  it("inserts erasure_log row with diner columns + actor + impersonator + reason", async () => {
    const { tx, calls } = makeTx();
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));

    const fn = makePseudonymiseDiner({ db: dbAdmin });
    await fn({
      dinerId: "diner-1",
      reason: "admin_dsar",
      actorUserId: "user-1",
      impersonatorUserId: "admin-9",
    });

    const erasure = calls[4].args as Record<string, unknown>;
    expect(erasure).toEqual({
      subjectType: "diner",
      subjectId: "diner-1",
      reason: "admin_dsar",
      redactedColumns: [...REDACTED_DINER_COLUMNS],
      actorUserId: "user-1",
      impersonatorUserId: "admin-9",
    });
  });

  it("emits two audit rows in order: diner.pseudonymised then compliance.erasure_executed", async () => {
    const { tx } = makeTx();
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));

    const fn = makePseudonymiseDiner({ db: dbAdmin });
    await fn({
      dinerId: "diner-1",
      reason: "owner_request",
      actorUserId: "user-1",
      impersonatorUserId: "admin-9",
    });

    expect(recordAudit).toHaveBeenCalledTimes(2);
    expect((recordAudit as jest.Mock).mock.calls[0][0]).toMatchObject({
      action: AUDIT.diner.pseudonymised,
      subjectType: "diner",
      subjectId: "diner-1",
      actorUserId: "user-1",
      impersonatorUserId: "admin-9",
      actorRole: "venue_owner",
      context: { reason: "owner_request" },
    });
    expect((recordAudit as jest.Mock).mock.calls[1][0]).toMatchObject({
      action: AUDIT.compliance.erasure_executed,
      subjectType: "diner",
      subjectId: "diner-1",
      actorUserId: "user-1",
      impersonatorUserId: "admin-9",
      actorRole: "venue_owner",
      context: {
        reason: "owner_request",
        redacted_columns: [...REDACTED_DINER_COLUMNS],
      },
    });
  });

  it("defaults actorRole to venue_owner; honours tavli_admin override", async () => {
    const { tx } = makeTx();
    (dbAdmin.transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));

    const fn = makePseudonymiseDiner({ db: dbAdmin });
    await fn({
      dinerId: "diner-1",
      reason: "admin_override",
      actorUserId: "user-1",
      actorRole: "tavli_admin",
    });

    expect((recordAudit as jest.Mock).mock.calls[0][0]).toMatchObject({
      actorRole: "tavli_admin",
    });
    expect((recordAudit as jest.Mock).mock.calls[1][0]).toMatchObject({
      actorRole: "tavli_admin",
    });
  });

  it("exposes the 11-column redacted_columns shape for §16.2 readability", () => {
    expect(REDACTED_DINER_COLUMNS).toEqual([
      "phone",
      "phone_raw",
      "email",
      "full_name",
      "internal_notes",
      "allergies",
      "occasion_tags",
      "seating_preferences",
      "dietary_preferences",
      "birthday_date",
      "anniversary_date",
    ]);
  });

  it("is idempotent: second call on an already-redacted diner is a no-op", async () => {
    // Simulate the second call: SELECT FOR UPDATE finds redactedAt non-null
    // → handler returns early without writing audit, erasure_log, or cascade rows.
    let updateCalls = 0;
    let insertCalls = 0;
    const txMock = jest.fn().mockImplementation(async (callback) => {
      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              for: jest.fn().mockResolvedValue([
                { redactedAt: new Date("2024-01-01T00:00:00Z") },
              ]),
            }),
          }),
        }),
        update: jest.fn().mockImplementation(() => {
          updateCalls += 1;
          return {
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]),
            }),
          };
        }),
        insert: jest.fn().mockImplementation(() => {
          insertCalls += 1;
          return { values: jest.fn().mockResolvedValue([]) };
        }),
      };
      await callback(tx);
    });
    const db = { transaction: txMock } as unknown as typeof dbAdmin;
    const subject = makePseudonymiseDiner({ db });
    await subject({
      dinerId: "00000000-0000-0000-0000-000000000001",
      reason: "gdpr_erasure",
      actorUserId: "00000000-0000-0000-0000-000000000002",
    });
    expect(updateCalls).toBe(0);
    expect(insertCalls).toBe(0);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("sets redacted_at on cascaded reservations and reviews rows", async () => {
    let reservationsSetValues: Record<string, unknown> | null = null;
    let reviewsSetValues: Record<string, unknown> | null = null;
    const txMock = jest.fn().mockImplementation(async (callback) => {
      const tx = {
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              for: jest.fn().mockResolvedValue([{ redactedAt: null }]),
            }),
          }),
        }),
        update: jest.fn().mockImplementation((table) => ({
          set: jest.fn().mockImplementation((values) => {
            if (table === reservations) reservationsSetValues = values;
            if (table === reviews) reviewsSetValues = values;
            return { where: jest.fn().mockResolvedValue([]) };
          }),
        })),
        insert: jest
          .fn()
          .mockReturnValue({ values: jest.fn().mockResolvedValue([]) }),
        execute: jest.fn().mockResolvedValue([]),
      };
      await callback(tx);
    });
    const db = { transaction: txMock } as unknown as typeof dbAdmin;
    const subject = makePseudonymiseDiner({ db });
    await subject({
      dinerId: "00000000-0000-0000-0000-000000000001",
      reason: "gdpr_erasure",
      actorUserId: "00000000-0000-0000-0000-000000000002",
    });
    expect((reservationsSetValues as unknown as Record<string, unknown>).redactedAt).toBeInstanceOf(Date);
    expect((reviewsSetValues as unknown as Record<string, unknown>).redactedAt).toBeInstanceOf(Date);
  });
});
