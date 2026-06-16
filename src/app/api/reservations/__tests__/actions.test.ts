/**
 * @jest-environment node
 *
 * Unit tests for the public-flow createReservation server action. Drives a
 * mocked Supabase admin client + audit/email shims to validate the audit
 * row's impersonator threading on the §01 §5a.3 phase 2 sub-unit C retrofit.
 */

// @react-email/render uses dynamic imports under the hood that jest can't
// resolve without --experimental-vm-modules. Stub it to a synchronous string
// returner — these tests don't care about the rendered HTML, only that the
// pipeline composes correctly.
jest.mock("@react-email/render", () => ({
  render: jest.fn().mockResolvedValue("<rendered/>"),
}));

// §i18n Phase 1c: createReservation reads the NEXT_LOCALE cookie; stub
// next/headers so the unit tests don't require a Next.js request context.
jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));

jest.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: jest.fn(),
}));
// The floor assignment + reservation insert now happen atomically in
// commitFloorBooking (drizzle transaction under the advisory lock); it has its
// own coverage. Here we stub it to a successful commit and verify the action's
// orchestration glue (audit, diner upsert, emails) around it.
jest.mock("@/lib/reservations/booking-commit", () => ({
  commitFloorBooking: jest.fn().mockResolvedValue({ ok: true, reservationId: "res-id-1" }),
}));
jest.mock("@/lib/email/send-transactional", () => ({
  sendTransactionalEmail: jest.fn().mockResolvedValue({
    ok: true,
    messageId: "test-msg-id",
    logId: "test-log-id",
  }),
}));
jest.mock("@/lib/audit/record", () => ({
  recordAudit: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/session", () => ({
  getCurrentSession: jest.fn(),
}));
// §01 §5a.3 phase 2 sub-unit C: currentActor wraps actorUserId with the
// impersonator-thread payload. Default to "no impersonation"; specific tests
// override with mockResolvedValueOnce.
jest.mock("@/lib/auth/current-actor", () => ({
  currentActor: jest.fn(async (id: string) => ({
    actorUserId: id,
    impersonatorUserId: null,
  })),
}));
// §03 §5.2 Wave 3 sub-unit A.3: stub the diner upsert. The helper has its
// own focused unit tests under src/lib/diners/__tests__/. Here we only
// verify the integration glue (called with the right args, diner_id
// stamped on the reservation row).
jest.mock("@/lib/diners/upsert", () => ({
  findOrCreateDinerForReservation: jest.fn().mockResolvedValue({
    dinerId: "diner-1",
    isNew: true,
  }),
}));
jest.mock("@/lib/integrations/anaf", () => ({
  ...jest.requireActual("@/lib/integrations/anaf"),
  lookupCui: jest.fn(),
}));
jest.mock("@/lib/repos/corporate-clients-repo", () => ({
  insertPendingCorporateClient: jest.fn().mockResolvedValue({ id: "corp-1" }),
}));

import { createReservation } from "../actions";
import { commitFloorBooking } from "@/lib/reservations/booking-commit";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { recordAudit } from "@/lib/audit/record";
import { getCurrentSession } from "@/lib/auth/session";
import { currentActor } from "@/lib/auth/current-actor";
import { findOrCreateDinerForReservation } from "@/lib/diners/upsert";
import { lookupCui } from "@/lib/integrations/anaf";
import { insertPendingCorporateClient } from "@/lib/repos/corporate-clients-repo";

const REAL_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

// A thenable query-builder stub that resolves to an empty result set — covers
// the floor-plan loads (restaurant_tables + the date's reservations) added by
// planTableAssignment. Empty tables → no floor plan → tableId null.
function emptyQuery(): Record<string, jest.Mock> & { then: (r: (v: unknown) => unknown) => unknown } {
  const q = {} as Record<string, jest.Mock> & { then: (r: (v: unknown) => unknown) => unknown };
  for (const m of ["select", "eq", "is", "in", "order", "not", "gte", "lt"]) {
    q[m] = jest.fn(() => q);
  }
  q.maybeSingle = jest.fn().mockResolvedValue({ data: null });
  q.then = (resolve) => resolve({ data: [], error: null });
  return q;
}

function setupSupabaseAdmin(opts: { organizationId?: string | null; acceptsCorporateMeals?: boolean } = {}) {
  const orgId = opts.organizationId === undefined ? "org-1" : opts.organizationId;
  const acceptsCorporateMeals = opts.acceptsCorporateMeals ?? true;
  const reservationUpdate = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: null }),
  });
  const adminMock = {
    from: jest.fn((table: string) => {
      if (table === "restaurant_tables") {
        return emptyQuery();
      }
      if (table === "reservations") {
        // loadFloorState reads the date's reservations via .select(...).eq()...;
        // the insert path uses its own .insert().select().single(). Provide both.
        const q = emptyQuery();
        q.insert = jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: "res-id-1", restaurant_id: REAL_UUID },
              error: null,
            }),
          }),
        });
        // §03 §5.2 Wave 3 sub-unit A.3: createReservation stamps the
        // resolved diner_id onto the reservation row.
        q.update = reservationUpdate;
        return q;
      }
      if (table === "restaurants") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              name: "Casa",
              address: null,
              email: null,
              organization_id: orgId,
              accepts_corporate_meals: acceptsCorporateMeals,
            },
          }),
        };
      }
      if (table === "organizations") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: { locale: "ro" } }),
        };
      }
      throw new Error(`unexpected from(${table})`);
    }),
  };
  (createSupabaseAdminClient as jest.Mock).mockReturnValue(adminMock);
  return { reservationUpdate };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "key";
});

describe("createReservation (public flow)", () => {
  it("audits with actorUserId=null when no session is present", async () => {
    setupSupabaseAdmin();
    (getCurrentSession as jest.Mock).mockResolvedValue(null);

    const result = await createReservation({
      restaurantId: REAL_UUID,
      date: "2026-08-01",
      time: "19:00",
      partySize: 2,
      guestName: "A",
      guestPhone: "+40712345678",
    });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("db");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: null,
        actorRole: "diner",
      }),
    );
    const args = (recordAudit as jest.Mock).mock.calls[0][0];
    expect(args.impersonatorUserId).toBeUndefined();
  });

  it("threads impersonatorUserId when a signed-in admin is impersonating during a public booking", async () => {
    setupSupabaseAdmin();
    (getCurrentSession as jest.Mock).mockResolvedValue({
      userId: "u1",
      userEmail: "u1@test.co",
      profile: {
        id: "u1",
        role: "restaurant_owner",
        fullName: null,
        email: "u1@test.co",
        locale: "ro",
        defaultOrganizationId: null,
      },
    });
    (currentActor as jest.Mock).mockResolvedValueOnce({
      actorUserId: "u1",
      impersonatorUserId: "admin-9",
    });

    const result = await createReservation({
      restaurantId: REAL_UUID,
      date: "2026-08-01",
      time: "19:00",
      partySize: 2,
      guestName: "A",
      guestPhone: "+40712345678",
    });
    expect(result.ok).toBe(true);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "u1",
        impersonatorUserId: "admin-9",
      }),
    );
  });

  it("upserts a diner and stamps diner_id on the reservation row", async () => {
    const { reservationUpdate } = setupSupabaseAdmin();
    (getCurrentSession as jest.Mock).mockResolvedValue(null);

    const result = await createReservation({
      restaurantId: REAL_UUID,
      date: "2026-08-01",
      time: "19:00",
      partySize: 2,
      guestName: "A",
      guestPhone: "+40712345678",
      guestEmail: "a@test.co",
    });
    expect(result.ok).toBe(true);
    expect(findOrCreateDinerForReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        restaurantId: REAL_UUID,
        guestName: "A",
        guestPhone: "+40712345678",
        guestEmail: "a@test.co",
        acquisitionSource: "widget",
      }),
    );
    expect(reservationUpdate).toHaveBeenCalledWith({ diner_id: "diner-1" });
  });

  it("skips diner upsert when restaurant lacks organization_id", async () => {
    const { reservationUpdate } = setupSupabaseAdmin({ organizationId: null });
    (getCurrentSession as jest.Mock).mockResolvedValue(null);

    const result = await createReservation({
      restaurantId: REAL_UUID,
      date: "2026-08-01",
      time: "19:00",
      partySize: 2,
      guestName: "A",
      guestPhone: "+40712345678",
    });
    expect(result.ok).toBe(true);
    expect(findOrCreateDinerForReservation).not.toHaveBeenCalled();
    expect(reservationUpdate).not.toHaveBeenCalled();
  });

  it("maps party_too_large → PARTY_TOO_LARGE and surfaces maxParty", async () => {
    setupSupabaseAdmin();
    (getCurrentSession as jest.Mock).mockResolvedValue(null);
    (commitFloorBooking as jest.Mock).mockResolvedValueOnce({ ok: false, reason: "party_too_large", maxParty: 22 });

    const r = await createReservation({
      restaurantId: REAL_UUID, date: "2026-08-01", time: "19:00", partySize: 40,
      guestName: "A", guestPhone: "+40712345678",
    });
    expect(r).toMatchObject({ ok: false, errorCode: "PARTY_TOO_LARGE", maxParty: 22 });
  });

  it("maps no_availability → NO_AVAILABILITY", async () => {
    setupSupabaseAdmin();
    (getCurrentSession as jest.Mock).mockResolvedValue(null);
    (commitFloorBooking as jest.Mock).mockResolvedValueOnce({ ok: false, reason: "no_availability" });

    const r = await createReservation({
      restaurantId: REAL_UUID, date: "2026-08-01", time: "03:00", partySize: 2,
      guestName: "A", guestPhone: "+40712345678",
    });
    expect(r).toMatchObject({ ok: false, errorCode: "NO_AVAILABILITY" });
  });

  it("maps no_table → SLOT_FULL", async () => {
    setupSupabaseAdmin();
    (getCurrentSession as jest.Mock).mockResolvedValue(null);
    (commitFloorBooking as jest.Mock).mockResolvedValueOnce({ ok: false, reason: "no_table" });

    const r = await createReservation({
      restaurantId: REAL_UUID, date: "2026-08-01", time: "19:00", partySize: 4,
      guestName: "A", guestPhone: "+40712345678",
    });
    expect(r).toMatchObject({ ok: false, errorCode: "SLOT_FULL" });
  });

  it("maps an unexpected commit error → OTHER", async () => {
    setupSupabaseAdmin();
    (getCurrentSession as jest.Mock).mockResolvedValue(null);
    (commitFloorBooking as jest.Mock).mockResolvedValueOnce({ ok: false, reason: "error", message: "boom" });

    const r = await createReservation({
      restaurantId: REAL_UUID, date: "2026-08-01", time: "19:00", partySize: 4,
      guestName: "A", guestPhone: "+40712345678",
    });
    expect(r).toMatchObject({ ok: false, errorCode: "OTHER" });
  });

  it("tags corporate_client_id when company fields + flag are present (ANAF found)", async () => {
    setupSupabaseAdmin();
    (getCurrentSession as jest.Mock).mockResolvedValue(null);
    (lookupCui as jest.Mock).mockResolvedValue({ ok: true, found: true, cui: "12345678", name: "ANAF SRL", legalName: "ANAF SRL", address: "Str. X", vatPayer: true });

    const r = await createReservation({
      restaurantId: REAL_UUID, date: "2026-08-01", time: "19:00", partySize: 2,
      guestName: "A", guestPhone: "+40712345678",
      companyCui: "RO12345678", companyName: "Typed",
    });
    expect(r.ok).toBe(true);
    expect(insertPendingCorporateClient).toHaveBeenCalledWith(
      expect.objectContaining({ cui: "RO12345678", name: "ANAF SRL", billingAddress: "Str. X", vatPayer: true }),
    );
    expect(commitFloorBooking).toHaveBeenCalledWith(expect.objectContaining({ corporateClientId: "corp-1" }));
  });

  it("does NOT tag when the venue flag is off", async () => {
    setupSupabaseAdmin({ acceptsCorporateMeals: false });
    (getCurrentSession as jest.Mock).mockResolvedValue(null);

    const r = await createReservation({
      restaurantId: REAL_UUID, date: "2026-08-01", time: "19:00", partySize: 2,
      guestName: "A", guestPhone: "+40712345678", companyCui: "RO12345678", companyName: "Typed",
    });
    expect(r.ok).toBe(true);
    expect(insertPendingCorporateClient).not.toHaveBeenCalled();
    expect(commitFloorBooking).toHaveBeenCalledWith(expect.objectContaining({ corporateClientId: null }));
  });

  it("rejects a malformed company CUI (non-silent)", async () => {
    setupSupabaseAdmin();
    (getCurrentSession as jest.Mock).mockResolvedValue(null);

    const r = await createReservation({
      restaurantId: REAL_UUID, date: "2026-08-01", time: "19:00", partySize: 2,
      guestName: "A", guestPhone: "+40712345678", companyCui: "NOT-A-CUI", companyName: "Typed",
    });
    expect(r).toMatchObject({ ok: false, errorCode: "OTHER" });
    expect(commitFloorBooking).not.toHaveBeenCalled();
  });

  it("books standard (corporateClientId null) when no company fields are sent", async () => {
    setupSupabaseAdmin();
    (getCurrentSession as jest.Mock).mockResolvedValue(null);
    const r = await createReservation({
      restaurantId: REAL_UUID, date: "2026-08-01", time: "19:00", partySize: 2,
      guestName: "A", guestPhone: "+40712345678",
    });
    expect(r.ok).toBe(true);
    expect(commitFloorBooking).toHaveBeenCalledWith(expect.objectContaining({ corporateClientId: null }));
  });

  it("still books (untagged) when company resolution throws", async () => {
    setupSupabaseAdmin();
    (getCurrentSession as jest.Mock).mockResolvedValue(null);
    (lookupCui as jest.Mock).mockResolvedValue({ ok: true, found: true, cui: "12345678", name: "ANAF SRL" });
    (insertPendingCorporateClient as jest.Mock).mockRejectedValueOnce(new Error("db transient"));
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const r = await createReservation({
      restaurantId: REAL_UUID, date: "2026-08-01", time: "19:00", partySize: 2,
      guestName: "A", guestPhone: "+40712345678",
      companyCui: "RO12345678", companyName: "Typed",
    });
    expect(r.ok).toBe(true);
    expect(commitFloorBooking).toHaveBeenCalledWith(expect.objectContaining({ corporateClientId: null }));
    errSpy.mockRestore();
  });

  it("still confirms the booking when the diner upsert throws", async () => {
    const { reservationUpdate } = setupSupabaseAdmin();
    (getCurrentSession as jest.Mock).mockResolvedValue(null);
    (findOrCreateDinerForReservation as jest.Mock).mockRejectedValueOnce(
      new Error("simulated DB outage"),
    );
    // Suppress the expected diagnostic log so test output stays clean.
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await createReservation({
      restaurantId: REAL_UUID,
      date: "2026-08-01",
      time: "19:00",
      partySize: 2,
      guestName: "A",
      guestPhone: "+40712345678",
    });
    expect(result.ok).toBe(true);
    expect(reservationUpdate).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
