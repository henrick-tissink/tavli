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

import { createReservation } from "../actions";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { recordAudit } from "@/lib/audit/record";
import { getCurrentSession } from "@/lib/auth/session";
import { currentActor } from "@/lib/auth/current-actor";

const REAL_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function setupSupabaseAdmin() {
  let restaurantsCall = 0;
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
        };
      }
      if (table === "restaurants") {
        restaurantsCall++;
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              name: "Casa",
              address: null,
              email: null,
              organization_id: "org-1",
            },
          }),
        };
      }
      throw new Error(`unexpected from(${table}) call ${restaurantsCall}`);
    }),
  };
  (createSupabaseAdminClient as jest.Mock).mockReturnValue(adminMock);
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
});
