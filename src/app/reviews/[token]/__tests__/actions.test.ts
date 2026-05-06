import { submitReviewByToken } from "@/app/reviews/[token]/actions";

jest.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: jest.fn(),
}));
import { createSupabaseAdminClient } from "@/lib/db/admin";

const OLD_ENV = process.env;
beforeEach(() => {
  jest.resetAllMocks();
  process.env = {
    ...OLD_ENV,
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
  };
});
afterEach(() => {
  process.env = OLD_ENV;
});

function buildAdminMock(opts: {
  reservation?: Record<string, unknown> | null;
  insertError?: { code?: string; message?: string } | null;
}) {
  const reservation = opts.reservation ?? null;
  const single = jest.fn().mockResolvedValue({
    data: reservation,
    error: reservation ? null : { message: "not found" },
  });
  const reservationsChain: Record<string, jest.Mock> = {
    select: jest.fn(() => reservationsChain),
    eq: jest.fn(() => reservationsChain),
    maybeSingle: single,
  };
  const insertSelect = jest.fn().mockResolvedValue({
    data: opts.insertError ? null : [{ id: "rev-1" }],
    error: opts.insertError ?? null,
  });
  const reviewsChain = {
    insert: jest.fn(() => ({ select: insertSelect })),
  };
  (createSupabaseAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((tbl: string) =>
      tbl === "reservations" ? reservationsChain : reviewsChain,
    ),
  });
  return { reservationsChain, reviewsChain, insertSelect };
}

describe("submitReviewByToken", () => {
  test("rejects rating outside 1..5", async () => {
    const r = await submitReviewByToken("tok", { rating: 0, comment: "" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/rating/i);
  });

  test("rejects comment longer than 500 chars", async () => {
    const r = await submitReviewByToken("tok", {
      rating: 5,
      comment: "x".repeat(501),
    });
    expect(r.ok).toBe(false);
  });

  test("returns not-found for unknown token", async () => {
    buildAdminMock({ reservation: null });
    const r = await submitReviewByToken("tok", { rating: 5, comment: "" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("NOT_FOUND");
  });

  test("rejects when reservation was cancelled", async () => {
    buildAdminMock({
      reservation: {
        id: "res-1",
        restaurant_id: "rest-1",
        guest_name: "Ana Pop",
        status: "cancelled",
      },
    });
    const r = await submitReviewByToken("tok", { rating: 5, comment: "" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("INELIGIBLE");
  });

  test("inserts a review with first-name only and snapshots booking context", async () => {
    const { reviewsChain } = buildAdminMock({
      reservation: {
        id: "res-1",
        restaurant_id: "rest-1",
        guest_name: "Ana Pop",
        status: "confirmed",
        party_size: 2,
        reservation_date: "2026-04-29",
      },
    });
    const r = await submitReviewByToken("tok", {
      rating: 4,
      comment: " Lovely ",
    });
    expect(r.ok).toBe(true);
    expect(reviewsChain.insert).toHaveBeenCalledWith({
      reservation_id: "res-1",
      restaurant_id: "rest-1",
      rating: 4,
      comment: "Lovely",
      first_name: "Ana",
      party_size: 2,
      reservation_date: "2026-04-29",
    });
  });

  test("returns ALREADY_REVIEWED on UNIQUE violation", async () => {
    buildAdminMock({
      reservation: {
        id: "res-1",
        restaurant_id: "rest-1",
        guest_name: "Ana Pop",
        status: "confirmed",
      },
      insertError: { code: "23505", message: "duplicate key" },
    });
    const r = await submitReviewByToken("tok", { rating: 5, comment: "" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("ALREADY_REVIEWED");
  });
});
