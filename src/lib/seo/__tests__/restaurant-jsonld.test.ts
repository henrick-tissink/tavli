import {
  buildRestaurantJsonLd,
  serializeJsonLd,
  type AvailabilitySlot,
} from "@/lib/seo/restaurant-jsonld";
import type { RestaurantDetail } from "@/lib/types";

function makeDetail(overrides: Partial<RestaurantDetail> = {}): RestaurantDetail {
  const base: RestaurantDetail = {
    id: "r1",
    slug: "casa-veche",
    name: "Casa Veche",
    cuisine: "Romanian",
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
    description: "A cozy traditional Romanian restaurant.",
    photos: [
      "https://images.example.com/hero.jpg",
      "https://images.example.com/2.jpg",
    ],
    schedule: [{ days: "Mon–Sun", hours: "12:00 – 23:00" }],
    address: "Strada Lipscani 12",
    tags: [],
    reviewIntelligence: null,
    reviews: [],
    nearby: [],
  };
  return { ...base, ...overrides };
}

const fullAvailability: AvailabilitySlot[] = [
  { dayOfWeek: 1, slotStart: "12:00:00", slotEnd: "23:00:00" }, // Mon
  { dayOfWeek: 2, slotStart: "12:00:00", slotEnd: "23:00:00" },
];

describe("buildRestaurantJsonLd", () => {
  const originalEnv = process.env.NEXT_PUBLIC_SITE_URL;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://tavli.ro";
  });

  afterAll(() => {
    if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalEnv;
  });

  test("emits a Restaurant @type with @context schema.org", () => {
    const ld = buildRestaurantJsonLd({
      detail: makeDetail(),
      citySlug: "bucuresti",
      countryCode: "RO",
      phone: null,
      availability: [],
      hasMenu: false,
    });
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Restaurant");
  });

  test("includes name, url, address, geo, cuisine, priceRange, image[]", () => {
    const ld = buildRestaurantJsonLd({
      detail: makeDetail(),
      citySlug: "bucuresti",
      countryCode: "RO",
      phone: null,
      availability: [],
      hasMenu: false,
    });
    expect(ld.name).toBe("Casa Veche");
    expect(ld.url).toBe("https://tavli.ro/bucuresti/casa-veche");
    expect(ld.servesCuisine).toBe("Romanian");
    expect(ld.priceRange).toBe("$$");
    expect(ld.image).toEqual([
      "https://images.example.com/hero.jpg",
      "https://images.example.com/2.jpg",
    ]);
    expect(ld.address).toEqual({
      "@type": "PostalAddress",
      streetAddress: "Strada Lipscani 12",
      addressLocality: "București",
      addressCountry: "RO",
    });
    expect(ld.geo).toEqual({
      "@type": "GeoCoordinates",
      latitude: 44.4323,
      longitude: 26.0966,
    });
    expect(ld.acceptsReservations).toBe(true);
  });

  test("priceRange maps 1..4 → $..$$$$", () => {
    const make = (priceLevel: 1 | 2 | 3 | 4) =>
      buildRestaurantJsonLd({
        detail: makeDetail({ priceLevel }),
        citySlug: "bucuresti",
        countryCode: "RO",
        phone: null,
        availability: [],
        hasMenu: false,
      }).priceRange;
    expect(make(1)).toBe("$");
    expect(make(2)).toBe("$$");
    expect(make(3)).toBe("$$$");
    expect(make(4)).toBe("$$$$");
  });

  test("aggregateRating included when voteCount > 0", () => {
    const ld = buildRestaurantJsonLd({
      detail: makeDetail(),
      citySlug: "bucuresti",
      countryCode: "RO",
      phone: null,
      availability: [],
      hasMenu: false,
    });
    expect(ld.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.7,
      reviewCount: 312,
    });
  });

  test("aggregateRating omitted when voteCount is 0", () => {
    const ld = buildRestaurantJsonLd({
      detail: makeDetail({ voteCount: 0 }),
      citySlug: "bucuresti",
      countryCode: "RO",
      phone: null,
      availability: [],
      hasMenu: false,
    });
    expect(ld.aggregateRating).toBeUndefined();
  });

  test("openingHoursSpecification mapped from availability rows", () => {
    const ld = buildRestaurantJsonLd({
      detail: makeDetail(),
      citySlug: "bucuresti",
      countryCode: "RO",
      phone: null,
      availability: fullAvailability,
      hasMenu: false,
    });
    expect(ld.openingHoursSpecification).toEqual([
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Monday",
        opens: "12:00",
        closes: "23:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Tuesday",
        opens: "12:00",
        closes: "23:00",
      },
    ]);
  });

  test("openingHoursSpecification omitted when availability is empty", () => {
    const ld = buildRestaurantJsonLd({
      detail: makeDetail(),
      citySlug: "bucuresti",
      countryCode: "RO",
      phone: null,
      availability: [],
      hasMenu: false,
    });
    expect(ld.openingHoursSpecification).toBeUndefined();
  });

  test("hasMenu URL emitted only when hasMenu=true", () => {
    const withMenu = buildRestaurantJsonLd({
      detail: makeDetail(),
      citySlug: "bucuresti",
      countryCode: "RO",
      phone: null,
      availability: [],
      hasMenu: true,
    });
    expect(withMenu.hasMenu).toBe("https://tavli.ro/bucuresti/casa-veche/menu");

    const noMenu = buildRestaurantJsonLd({
      detail: makeDetail(),
      citySlug: "bucuresti",
      countryCode: "RO",
      phone: null,
      availability: [],
      hasMenu: false,
    });
    expect(noMenu.hasMenu).toBeUndefined();
  });

  test("telephone included only when phone is non-null", () => {
    const withPhone = buildRestaurantJsonLd({
      detail: makeDetail(),
      citySlug: "bucuresti",
      countryCode: "RO",
      phone: "+40 21 555 1234",
      availability: [],
      hasMenu: false,
    });
    expect(withPhone.telephone).toBe("+40 21 555 1234");

    const noPhone = buildRestaurantJsonLd({
      detail: makeDetail(),
      citySlug: "bucuresti",
      countryCode: "RO",
      phone: null,
      availability: [],
      hasMenu: false,
    });
    expect(noPhone.telephone).toBeUndefined();
  });

  test("geo omitted when lat/lng are sentinel 0,0", () => {
    const ld = buildRestaurantJsonLd({
      detail: makeDetail({ lat: 0, lng: 0 }),
      citySlug: "bucuresti",
      countryCode: "RO",
      phone: null,
      availability: [],
      hasMenu: false,
    });
    expect(ld.geo).toBeUndefined();
  });

  test("addressCountry uses provided countryCode (TR-ready)", () => {
    const ld = buildRestaurantJsonLd({
      detail: makeDetail({ city: "İstanbul" }),
      citySlug: "istanbul",
      countryCode: "TR",
      phone: null,
      availability: [],
      hasMenu: false,
    });
    expect((ld.address as { addressCountry: string }).addressCountry).toBe("TR");
  });
});

describe("serializeJsonLd", () => {
  test("escapes </script> to prevent breaking out of the script tag", () => {
    const result = serializeJsonLd({ name: "Hostile </script><script>alert(1)</script>" });
    expect(result).not.toContain("</script>");
    expect(result).toContain("\\u003c/script");
  });

  test("escapes lone < anywhere in the payload", () => {
    const result = serializeJsonLd({ note: "5 < 6" });
    expect(result).not.toContain("<");
    expect(result).toContain("\\u003c");
  });

  test("produces valid JSON that round-trips", () => {
    const input = { foo: "bar", n: 42, nested: { a: [1, 2, 3] } };
    const out = serializeJsonLd(input);
    // After undoing the < escape, JSON.parse should succeed.
    const recovered = JSON.parse(out.replace(/\\u003c/g, "<"));
    expect(recovered).toEqual(input);
  });
});
