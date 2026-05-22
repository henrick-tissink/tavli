/**
 * @jest-environment node
 */

import { cancelReservation, updateReservationStatus } from "../actions";

// Mock the Supabase server client and email sender so we can drive every branch.
jest.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: jest.fn(),
}));
jest.mock("@/lib/email/resend", () => ({
  sendEmail: jest.fn(),
}));
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));
jest.mock("@/lib/auth/session", () => ({
  getCurrentSession: jest.fn(),
}));
jest.mock("@/lib/restaurants/current-user", () => ({
  currentUserPrimaryRestaurant: jest.fn(),
}));
// §02 audit retrofit: the mutation sites now call recordAudit() + getActorRole.
// Both hit dbAdmin against the real local DB which isn't available in this
// suite's mocked supabase context — stub them out so the business-logic
// assertions stay isolated.
jest.mock("@/lib/audit/record", () => ({
  recordAudit: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/audit/actor-role", () => ({
  getActorRole: jest.fn().mockResolvedValue("venue_owner"),
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

import { createSupabaseServerClient } from "@/lib/db/server";
import { sendEmail } from "@/lib/email/resend";
import { getCurrentSession } from "@/lib/auth/session";
import { currentUserPrimaryRestaurant } from "@/lib/restaurants/current-user";

interface ReservationFixture {
  id: string;
  status: string;
  guest_name: string;
  guest_email: string | null;
  reservation_date: string;
  reservation_time: string;
  party_size: number;
  restaurants: {
    name: string;
    email: string | null;
    slug: string;
    cities: { slug: string };
  };
}

interface SetupArgs {
  user: { id: string } | null;
  ownerRestaurantId: string | null;
  reservation: ReservationFixture | null;
  updateError?: Error | null;
}

function setupSupabase({
  user,
  ownerRestaurantId,
  reservation,
  updateError = null,
}: SetupArgs) {
  let reservationsCallCount = 0;

  const supabaseMock = {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user } }),
    },
    from: jest.fn((table: string) => {
      if (table === "restaurants") {
        // §02 audit retrofit: org_id lookup for the audit row's
        // organizationId. Behaviour doesn't depend on it; return a stable
        // null so the audit call composes correctly.
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { organization_id: null },
          }),
        };
      }
      if (table === "reservations") {
        reservationsCallCount++;
        if (reservationsCallCount === 1) {
          // SELECT-with-join → terminates at maybeSingle()
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: reservation }),
          };
        }
        // 2nd call: UPDATE → terminates at await on the chain itself.
        const updateChain: Record<string, unknown> = {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (
            resolve: (v: { error: Error | null }) => unknown,
            reject: (e: unknown) => unknown,
          ) => Promise.resolve({ error: updateError }).then(resolve, reject),
        };
        // mockReturnThis stand-ins need `this` to be the chain itself
        (updateChain.update as jest.Mock).mockReturnValue(updateChain);
        (updateChain.eq as jest.Mock).mockReturnValue(updateChain);
        return updateChain;
      }
      throw new Error(`Unexpected from(${table})`);
    }),
  };

  (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabaseMock);
  // §3.6 sub-unit B: actions now resolve the active venue via the helper
  // off CurrentSession instead of a direct restaurants.owner_user_id lookup.
  (getCurrentSession as jest.Mock).mockResolvedValue(
    user
      ? {
          userId: user.id,
          userEmail: `${user.id}@test.co`,
          profile: {
            id: user.id,
            role: "restaurant_owner",
            fullName: null,
            email: `${user.id}@test.co`,
            locale: "ro",
            defaultOrganizationId: null,
          },
        }
      : null,
  );
  (currentUserPrimaryRestaurant as jest.Mock).mockResolvedValue(
    ownerRestaurantId,
  );
  return supabaseMock;
}

function fixture(overrides: Partial<ReservationFixture> = {}): ReservationFixture {
  return {
    id: "res-1",
    status: "confirmed",
    guest_name: "Maria",
    guest_email: "maria@example.com",
    reservation_date: "2026-05-01",
    reservation_time: "19:30:00",
    party_size: 4,
    restaurants: {
      name: "Casa Veche",
      email: "host@casaveche.ro",
      slug: "casa-veche",
      cities: { slug: "bucuresti" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (sendEmail as jest.Mock).mockResolvedValue({ ok: true });
});

describe("cancelReservation", () => {
  test("rejects unknown reason keys", async () => {
    setupSupabase({
      user: { id: "u1" },
      ownerRestaurantId: "r1",
      reservation: fixture(),
    });
    const result = await cancelReservation("res-1", "made-up-reason");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/motiv/i);
    // No DB writes when input is invalid
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("rejects when there is no signed-in user", async () => {
    setupSupabase({
      user: null,
      ownerRestaurantId: null,
      reservation: null,
    });
    const result = await cancelReservation("res-1", "overbooked");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/autentificat/i);
  });

  test("rejects when the user owns no restaurant", async () => {
    setupSupabase({
      user: { id: "u1" },
      ownerRestaurantId: null,
      reservation: null,
    });
    const result = await cancelReservation("res-1", "overbooked");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/restaurant/i);
  });

  test("rejects when the reservation isn't found / not owned", async () => {
    setupSupabase({
      user: { id: "u1" },
      ownerRestaurantId: "r1",
      reservation: null,
    });
    const result = await cancelReservation("res-1", "overbooked");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nu a fost găsită/i);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("rejects when reservation status is not confirmed", async () => {
    setupSupabase({
      user: { id: "u1" },
      ownerRestaurantId: "r1",
      reservation: fixture({ status: "cancelled" }),
    });
    const result = await cancelReservation("res-1", "overbooked");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/confirmate/i);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("happy path: updates status, sends email, returns ok+emailSent=true", async () => {
    setupSupabase({
      user: { id: "u1" },
      ownerRestaurantId: "r1",
      reservation: fixture(),
    });
    const result = await cancelReservation("res-1", "overbooked");
    expect(result.ok).toBe(true);
    expect(result.emailSent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const args = (sendEmail as jest.Mock).mock.calls[0][0];
    expect(args.to).toBe("maria@example.com");
    expect(args.replyTo).toBe("host@casaveche.ro");
    expect(args.subject).toMatch(/anulat/i);
  });

  test("skips email when guest_email is null", async () => {
    setupSupabase({
      user: { id: "u1" },
      ownerRestaurantId: "r1",
      reservation: fixture({ guest_email: null }),
    });
    const result = await cancelReservation("res-1", "overbooked");
    expect(result.ok).toBe(true);
    expect(result.emailSent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("returns ok with emailSent=false when Resend fails", async () => {
    setupSupabase({
      user: { id: "u1" },
      ownerRestaurantId: "r1",
      reservation: fixture(),
    });
    (sendEmail as jest.Mock).mockResolvedValue({ ok: false, error: "boom" });
    const result = await cancelReservation("res-1", "overbooked");
    expect(result.ok).toBe(true);
    expect(result.emailSent).toBe(false);
    // The DB write isn't rolled back — partner has a workable workaround.
  });

  test("returns ok with emailSent=true in dev mode (RESEND_API_KEY unset)", async () => {
    setupSupabase({
      user: { id: "u1" },
      ownerRestaurantId: "r1",
      reservation: fixture(),
    });
    (sendEmail as jest.Mock).mockResolvedValue({ ok: true, devMode: true });
    const result = await cancelReservation("res-1", "overbooked");
    expect(result.ok).toBe(true);
    expect(result.emailSent).toBe(true);
  });

  test("propagates DB error when the UPDATE fails", async () => {
    setupSupabase({
      user: { id: "u1" },
      ownerRestaurantId: "r1",
      reservation: fixture(),
      updateError: new Error("rls denied"),
    });
    const result = await cancelReservation("res-1", "overbooked");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/rls denied/);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  // §01 §5a.3 phase 2 sub-unit C: the cancellation audit row must carry the
  // impersonator's user id when an admin is acting-as the venue owner.
  test("threads impersonatorUserId when impersonation is active", async () => {
    setupSupabase({
      user: { id: "u1" },
      ownerRestaurantId: "r1",
      reservation: fixture(),
    });
    const { currentActor } = jest.requireMock("@/lib/auth/current-actor");
    (currentActor as jest.Mock).mockResolvedValueOnce({
      actorUserId: "u1",
      impersonatorUserId: "admin-9",
    });
    const { recordAudit } = jest.requireMock("@/lib/audit/record");
    await cancelReservation("res-1", "overbooked");
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "u1",
        impersonatorUserId: "admin-9",
      }),
    );
  });
});

// §01 §5a.3 phase 2 sub-unit C: updateReservationStatus retrofit. The mock
// only sees one `reservations` call (UPDATE) plus one `restaurants` lookup,
// so we use a smaller setup helper.
function setupSupabaseForUpdate(
  ownerRestaurantId: string | null,
  updateError: Error | null = null,
) {
  const supabaseMock = {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
    from: jest.fn((table: string) => {
      if (table === "restaurants") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: { organization_id: null },
          }),
        };
      }
      if (table === "reservations") {
        const chain: Record<string, unknown> = {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (
            resolve: (v: { error: Error | null }) => unknown,
            reject: (e: unknown) => unknown,
          ) => Promise.resolve({ error: updateError }).then(resolve, reject),
        };
        (chain.update as jest.Mock).mockReturnValue(chain);
        (chain.eq as jest.Mock).mockReturnValue(chain);
        return chain;
      }
      throw new Error(`Unexpected from(${table})`);
    }),
  };
  (createSupabaseServerClient as jest.Mock).mockResolvedValue(supabaseMock);
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
  (currentUserPrimaryRestaurant as jest.Mock).mockResolvedValue(ownerRestaurantId);
  return supabaseMock;
}

describe("updateReservationStatus", () => {
  test("threads impersonatorUserId when impersonation is active", async () => {
    setupSupabaseForUpdate("r1");
    const { currentActor } = jest.requireMock("@/lib/auth/current-actor");
    (currentActor as jest.Mock).mockResolvedValueOnce({
      actorUserId: "u1",
      impersonatorUserId: "admin-9",
    });
    const { recordAudit } = jest.requireMock("@/lib/audit/record");
    const result = await updateReservationStatus("res-1", "seated");
    expect(result.ok).toBe(true);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "u1",
        impersonatorUserId: "admin-9",
        context: { next_status: "seated" },
      }),
    );
  });
});
