import { processReviews } from "@/lib/review-processor";
import type { Review } from "@/lib/types";

function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    id: "r1",
    authorName: "Test User",
    rating: 4,
    date: "2026-04-01",
    reservationDate: "2026-03-30",
    guestCount: 2,
    text: "",
    helpfulCount: 0,
    ...overrides,
  };
}

function makeReviews(count: number, textFn: (i: number) => string = () => ""): Review[] {
  return Array.from({ length: count }, (_, i) =>
    makeReview({ id: `r${i}`, text: textFn(i) }),
  );
}

describe("processReviews", () => {
  test("returns null with fewer than 5 reviews", () => {
    expect(processReviews([])).toBeNull();
    expect(processReviews(makeReviews(4))).toBeNull();
  });

  test("returns non-null with 5+ reviews", () => {
    const reviews = makeReviews(5, () => "The food was great and the service was excellent.");
    const result = processReviews(reviews);
    expect(result).not.toBeNull();
  });

  test("dimensions have valid percentages between 0 and 100", () => {
    const reviews = makeReviews(6, (i) =>
      i < 4
        ? "The food was amazing and delicious. Great service and friendly staff."
        : "The food was terrible and the service was slow.",
    );
    const result = processReviews(reviews);
    expect(result).not.toBeNull();
    for (const dim of result!.dimensions) {
      expect(dim.percent).toBeGreaterThanOrEqual(0);
      expect(dim.percent).toBeLessThanOrEqual(100);
    }
  });

  test("dimensions only include those with 3+ mentions", () => {
    const reviews = makeReviews(5, () => "The food was great. Amazing pasta.");
    const result = processReviews(reviews);
    expect(result).not.toBeNull();
    // Food dimension should appear (5 mentions), value should not (0 mentions)
    const labels = result!.dimensions.map((d) => d.label);
    expect(labels).toContain("Food");
    expect(labels).not.toContain("Value");
  });

  test("top mentions are sorted by count descending", () => {
    const reviews = makeReviews(6, () => "Great food and friendly staff. The date night was perfect.");
    const result = processReviews(reviews);
    expect(result).not.toBeNull();
    const mentions = result!.topMentions;
    for (let i = 1; i < mentions.length; i++) {
      expect(mentions[i].count).toBeLessThanOrEqual(mentions[i - 1].count);
    }
  });

  test("top mentions limited to 5", () => {
    const reviews = makeReviews(8, (i) =>
      [
        "fresh pasta and great wine. lovely evening.",
        "fresh pasta is perfect here. lovely evening out.",
        "great wine selection. fresh pasta always. lovely evening atmosphere.",
        "friendly staff and fresh pasta. great wine pairing.",
        "lovely evening with great wine. fresh pasta again.",
        "fresh pasta and friendly staff. lovely setting.",
        "great wine list. fresh pasta of course. friendly staff.",
        "lovely evening. fresh pasta is the best. great wine.",
      ][i],
    );
    const result = processReviews(reviews);
    expect(result).not.toBeNull();
    expect(result!.topMentions.length).toBeLessThanOrEqual(5);
  });

  test("best-for tags match keyword patterns", () => {
    const reviews = makeReviews(6, (i) =>
      i < 3
        ? "Perfect date night spot. Romantic atmosphere."
        : "Great for a group dinner with friends.",
    );
    const result = processReviews(reviews);
    expect(result).not.toBeNull();
    expect(result!.bestFor).toContain("Date night");
    expect(result!.bestFor).toContain("Groups");
  });

  test("best-for tags limited to 4", () => {
    const reviews = makeReviews(10, () =>
      "Date romantic group friend family kid business meeting terrace outdoor music live",
    );
    const result = processReviews(reviews);
    expect(result).not.toBeNull();
    expect(result!.bestFor.length).toBeLessThanOrEqual(4);
  });

  test("handles empty review texts gracefully", () => {
    const reviews = makeReviews(5, (i) => (i < 2 ? "Great food and service" : ""));
    const result = processReviews(reviews);
    expect(result).not.toBeNull();
    // Should not throw, dimensions may be empty due to insufficient mentions
    expect(result!.dimensions).toBeDefined();
    expect(result!.topMentions).toBeDefined();
    expect(result!.bestFor).toBeDefined();
  });

  test("handles all empty review texts", () => {
    const reviews = makeReviews(6);
    const result = processReviews(reviews);
    expect(result).not.toBeNull();
    expect(result!.dimensions).toHaveLength(0);
    expect(result!.topMentions).toHaveLength(0);
    expect(result!.bestFor).toHaveLength(0);
  });

  test("top mentions only include phrases appearing 2+ times", () => {
    const reviews = makeReviews(5, (i) =>
      i === 0
        ? "unique phrase here. fresh pasta is great."
        : "fresh pasta is amazing.",
    );
    const result = processReviews(reviews);
    expect(result).not.toBeNull();
    for (const mention of result!.topMentions) {
      expect(mention.count).toBeGreaterThanOrEqual(2);
    }
  });
});
