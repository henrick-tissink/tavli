import { firstNameFrom, mapRowToReview } from "@/lib/repos/reviews-repo";

describe("firstNameFrom", () => {
  test("returns first whitespace-separated token", () => {
    expect(firstNameFrom("Henrick Tissink")).toBe("Henrick");
    expect(firstNameFrom("Ana   Maria Pop")).toBe("Ana");
  });
  test("trims surrounding whitespace", () => {
    expect(firstNameFrom("  Bogdan  ")).toBe("Bogdan");
  });
  test("falls back when input is blank", () => {
    expect(firstNameFrom("")).toBe("Anonymous");
    expect(firstNameFrom("   ")).toBe("Anonymous");
  });
});

describe("mapRowToReview", () => {
  test("maps a DB row to a Review with deterministic id and ISO date", () => {
    const r = mapRowToReview({
      id: "rev-1",
      rating: 4,
      comment: "Lovely",
      first_name: "Ana",
      created_at: "2026-04-30T10:00:00Z",
      party_size: 2,
      reservation_date: "2026-04-29",
    });
    expect(r).toEqual({
      id: "rev-1",
      authorName: "Ana",
      rating: 4,
      date: "2026-04-30",
      reservationDate: "2026-04-29",
      guestCount: 2,
      text: "Lovely",
      helpfulCount: 0,
    });
  });
  test("treats null comment as empty text", () => {
    const r = mapRowToReview({
      id: "rev-2",
      rating: 5,
      comment: null,
      first_name: "Bogdan",
      created_at: "2026-04-30T10:00:00Z",
      party_size: 4,
      reservation_date: "2026-04-29",
    });
    expect(r.text).toBe("");
  });
});
