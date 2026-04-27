/**
 * @jest-environment node
 */

import { cancelReservation } from "../actions";

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

import { createSupabaseServerClient } from "@/lib/db/server";
import { sendEmail } from "@/lib/email/resend";

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
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: ownerRestaurantId ? { id: ownerRestaurantId } : null,
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
    expect(result.error).toMatch(/reason/i);
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
    expect(result.error).toMatch(/sign|auth/i);
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
    expect(result.error).toMatch(/not found/i);
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
    expect(result.error).toMatch(/confirmed/i);
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
    expect(args.subject).toMatch(/cancel/i);
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
});
