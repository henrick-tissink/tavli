/**
 * @jest-environment node
 *
 * §06 §4.1 review submission. Clock is frozen so the 30-day submission window
 * math is deterministic regardless of when the suite runs.
 */
import { freezeClock, unfreezeClock } from "@/test-support/clock";

jest.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: jest.fn(),
}));
jest.mock("next/headers", () => ({
  headers: jest.fn(async () => new Map<string, string>()),
}));
jest.mock("@/lib/rate-limit/enforce", () => ({
  enforceRateLimit: jest.fn(async () => ({ allowed: true, remaining: 4, resetsAt: new Date() })),
}));
jest.mock("@/lib/audit/record", () => ({
  recordAudit: jest.fn(async () => {}),
}));

import { submitReviewByToken } from "@/app/reviews/[token]/actions";
import { createSupabaseAdminClient } from "@/lib/db/admin";
import { headers } from "next/headers";
import { enforceRateLimit } from "@/lib/rate-limit/enforce";
import { recordAudit } from "@/lib/audit/record";

// Frozen "today" = 2099-01-01; the 30-day window opens 2098-12-02.
const ELIGIBLE_DATE = "2098-12-20"; // within window + in the past
const EXPIRED_DATE = "2098-11-01"; // older than 30 days
const FUTURE_DATE = "2099-06-01"; // visit hasn't happened yet

const OLD_ENV = process.env;
beforeEach(() => {
  jest.resetAllMocks();
  freezeClock(new Date(Date.UTC(2099, 0, 1, 9, 0, 0)));
  (headers as jest.Mock).mockResolvedValue(new Map<string, string>());
  (enforceRateLimit as jest.Mock).mockResolvedValue({ allowed: true, remaining: 4, resetsAt: new Date() });
  (recordAudit as jest.Mock).mockResolvedValue(undefined);
  process.env = {
    ...OLD_ENV,
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
  };
});
afterEach(() => {
  unfreezeClock();
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
    insert: jest.fn((_row: Record<string, unknown>) => ({ select: insertSelect })),
  };
  (createSupabaseAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn((tbl: string) =>
      tbl === "reservations" ? reservationsChain : reviewsChain,
    ),
  });
  return { reservationsChain, reviewsChain, insertSelect };
}

function eligibleReservation(over: Record<string, unknown> = {}) {
  return {
    id: "res-1",
    restaurant_id: "rest-1",
    guest_name: "Ana Pop",
    status: "confirmed",
    party_size: 2,
    reservation_date: ELIGIBLE_DATE,
    diner_id: null,
    ...over,
  };
}

describe("submitReviewByToken", () => {
  test("rejects rating outside 1..5", async () => {
    const r = await submitReviewByToken("tok", { rating: 0, comment: "" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/rating/i);
  });

  test("rejects comment longer than 500 chars", async () => {
    const r = await submitReviewByToken("tok", { rating: 5, comment: "x".repeat(501) });
    expect(r.ok).toBe(false);
  });

  test("returns not-found for unknown token", async () => {
    buildAdminMock({ reservation: null });
    const r = await submitReviewByToken("tok", { rating: 5, comment: "" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("NOT_FOUND");
  });

  test("rejects when reservation was cancelled", async () => {
    buildAdminMock({ reservation: eligibleReservation({ status: "cancelled" }) });
    const r = await submitReviewByToken("tok", { rating: 5, comment: "" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("INELIGIBLE");
  });

  test("rejects a future reservation (visit hasn't happened) — H1", async () => {
    buildAdminMock({ reservation: eligibleReservation({ reservation_date: FUTURE_DATE }) });
    const r = await submitReviewByToken("tok", { rating: 5 });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("INELIGIBLE");
  });

  test("rejects after the 30-day window with TV402/WINDOW_EXPIRED — H1", async () => {
    buildAdminMock({ reservation: eligibleReservation({ reservation_date: EXPIRED_DATE }) });
    const r = await submitReviewByToken("tok", { rating: 5 });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("WINDOW_EXPIRED");
  });

  test("rate-limits per IP (review.submit) — H1", async () => {
    (enforceRateLimit as jest.Mock).mockResolvedValue({ allowed: false, remaining: 0, resetsAt: new Date() });
    buildAdminMock({ reservation: eligibleReservation() });
    const r = await submitReviewByToken("tok", { rating: 5 });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("RATE_LIMITED");
    expect(enforceRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "review_submit" }));
  });

  test("inserts a review with first-name only and snapshots booking context", async () => {
    const { reviewsChain } = buildAdminMock({ reservation: eligibleReservation() });
    const r = await submitReviewByToken("tok", { rating: 4, comment: " Lovely " });
    expect(r.ok).toBe(true);
    expect(reviewsChain.insert).toHaveBeenCalledWith({
      reservation_id: "res-1",
      restaurant_id: "rest-1",
      diner_id: null,
      rating: 4,
      comment: "Lovely",
      first_name: "Ana",
      party_size: 2,
      reservation_date: ELIGIBLE_DATE,
      include_in_aggregate_rating: false,
      aggregate_consent_at: null,
    });
  });

  test("audits review.submitted with rating + aggregate-consent flag (no PII) — H1", async () => {
    buildAdminMock({ reservation: eligibleReservation() });
    await submitReviewByToken("tok", { rating: 5, includeInAggregate: true });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "review.submitted",
        subjectType: "review",
        actorRole: "diner",
        context: expect.objectContaining({ rating: 5, aggregate_consent: true }),
      }),
    );
  });

  test("selects diner_id from the reservation (C2)", async () => {
    const { reservationsChain } = buildAdminMock({ reservation: eligibleReservation({ diner_id: "diner-42" }) });
    await submitReviewByToken("tok", { rating: 5, comment: "" });
    expect(reservationsChain.select.mock.calls[0][0]).toContain("diner_id");
  });

  test("stamps the reservation's diner_id onto the review (C2 — GDPR reachability)", async () => {
    const { reviewsChain } = buildAdminMock({ reservation: eligibleReservation({ diner_id: "diner-42" }) });
    const r = await submitReviewByToken("tok", { rating: 4, comment: "" });
    expect(r.ok).toBe(true);
    expect(reviewsChain.insert).toHaveBeenCalledWith(expect.objectContaining({ diner_id: "diner-42" }));
  });

  test("records aggregate consent when the diner opts in (C3)", async () => {
    const { reviewsChain } = buildAdminMock({ reservation: eligibleReservation() });
    const r = await submitReviewByToken("tok", { rating: 5, includeInAggregate: true });
    expect(r.ok).toBe(true);
    const payload = reviewsChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.include_in_aggregate_rating).toBe(true);
    expect(typeof payload.aggregate_consent_at).toBe("string");
  });

  test("defaults to no aggregate consent (published but not counted) (C3)", async () => {
    const { reviewsChain } = buildAdminMock({ reservation: eligibleReservation() });
    const r = await submitReviewByToken("tok", { rating: 5 });
    expect(r.ok).toBe(true);
    const payload = reviewsChain.insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.include_in_aggregate_rating).toBe(false);
    expect(payload.aggregate_consent_at).toBeNull();
  });

  test("returns ALREADY_REVIEWED on UNIQUE violation", async () => {
    buildAdminMock({
      reservation: eligibleReservation(),
      insertError: { code: "23505", message: "duplicate key" },
    });
    const r = await submitReviewByToken("tok", { rating: 5, comment: "" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("ALREADY_REVIEWED");
  });
});
