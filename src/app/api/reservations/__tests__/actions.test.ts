/**
 * @jest-environment node
 *
 * Unit tests for the public-flow createReservation server action. Drives a
 * mocked Supabase admin client + audit/email shims to validate the audit
 * row's impersonator threading on the §01 §5a.3 phase 2 sub-unit C retrofit.
 */

jest.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: jest.fn(),
}));
jest.mock("@/lib/email/resend", () => ({
  sendEmail: jest.fn().mockResolvedValue({ ok: true }),
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

import { createReservation } from "../actions";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { recordAudit } from "@/lib/audit/record";
import { getCurrentSession } from "@/lib/auth/session";
import { currentActor } from "@/lib/auth/current-actor";
import { findOrCreateDinerForReservation } from "@/lib/diners/upsert";

const REAL_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function setupSupabaseAdmin(opts: { organizationId?: string | null } = {}) {
  const orgId = opts.organizationId === undefined ? "org-1" : opts.organizationId;
  const reservationUpdate = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: null }),
  });
  const adminMock = {
    from: jest.fn((table: string) => {
      if (table === "reservations") {
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: "res-id-1", restaurant_id: REAL_UUID },
                error: null,
              }),
            }),
          }),
          // §03 §5.2 Wave 3 sub-unit A.3: createReservation stamps the
          // resolved diner_id onto the reservation row.
          update: reservationUpdate,
        };
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
            },
          }),
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
