import { buildRestaurantMetadata } from "@/lib/seo/restaurant-metadata";
import type { RestaurantDetail } from "@/lib/types";

function makeDetail(overrides: Partial<RestaurantDetail> = {}): RestaurantDetail {
  const base: RestaurantDetail = {
    id: "r1",
    slug: "casa-veche",
    name: "Casa Veche",
    cuisines: ["Romanian"],
    priceLevel: 2,
    zone: "Centru Vechi",
    city: "București",
    rating: 4.7,
    voteCount: 312,
    photoUrl: "https://images.example.com/hero.jpg",
    photoCount: 24,
    status: "open",
    availableSlots: [],
    lat: 44.4323,
    lng: 26.0966,
    description:
      "A cozy traditional Romanian restaurant in the heart of the old town serving sarmale, mici, and other classics.",
    photos: ["https://images.example.com/hero.jpg"],
    schedule: [{ days: "Mon–Sun", hours: "12:00 – 23:00" }],
    address: "Strada Lipscani 12, Sector 3",
    tags: ["Traditional"],
    reviewIntelligence: null,
    reviews: [],
    nearby: [],
    chefPicks: [],
  };
  return { ...base, ...overrides };
}

describe("buildRestaurantMetadata", () => {
  const originalEnv = process.env.NEXT_PUBLIC_SITE_URL;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://tavli.ro";
  });

  afterAll(() => {
    if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalEnv;
  });

  test("title follows the per-restaurant pattern", () => {
    const m = buildRestaurantMetadata(makeDetail(), "bucuresti");
    expect(m.title).toBe("Casa Veche — Romanian în București | Tavli");
  });

  test("description is taken from the restaurant description", () => {
    const m = buildRestaurantMetadata(makeDetail(), "bucuresti");
    expect(m.description).toContain("traditional Romanian restaurant");
  });

  test("long descriptions are truncated at a word boundary near 160 chars", () => {
    const long =
      "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat";
    const m = buildRestaurantMetadata(makeDetail({ description: long }), "bucuresti");
    expect(m.description!.length).toBeLessThanOrEqual(163); // 160 + "..."
    expect(m.description).toMatch(/\.\.\.$/);
    // The kept text (before "...") must be a prefix of the original — no half-words inserted.
    const kept = m.description!.slice(0, -3);
    expect(long.startsWith(kept)).toBe(true);
    // The character immediately after the kept slice in the original must be whitespace —
    // proving we cut at a word boundary, not mid-word.
    expect(long.charAt(kept.length)).toMatch(/\s/);
  });

  test("falls back to a tagline when description is empty", () => {
    const m = buildRestaurantMetadata(makeDetail({ description: "" }), "bucuresti");
    expect(m.description).toBe("Restaurant Romanian în București. Rezervă o masă pe Tavli.");
  });

  test("canonical URL is absolute and uses citySlug", () => {
    const m = buildRestaurantMetadata(makeDetail(), "bucuresti");
    expect(m.alternates?.canonical).toBe("https://tavli.ro/bucuresti/casa-veche");
  });

  test("openGraph carries url, title, description, and hero image", () => {
    const m = buildRestaurantMetadata(makeDetail(), "bucuresti");
    expect(m.openGraph?.url).toBe("https://tavli.ro/bucuresti/casa-veche");
    expect(m.openGraph?.title).toBe("Casa Veche — Romanian în București | Tavli");
    expect(m.openGraph?.images).toEqual([
      { url: "https://images.example.com/hero.jpg" },
    ]);
  });

  test("openGraph image is omitted when there is no hero photo", () => {
    const m = buildRestaurantMetadata(
      makeDetail({ photoUrl: null }),
      "bucuresti",
    );
    expect(m.openGraph?.images).toBeUndefined();
  });

  test("twitter card mirrors openGraph as summary_large_image", () => {
    const m = buildRestaurantMetadata(makeDetail(), "bucuresti");
    const twitter = m.twitter as { card: string; title: string };
    expect(twitter.card).toBe("summary_large_image");
    expect(twitter.title).toBe("Casa Veche — Romanian în București | Tavli");
  });
});
