/**
 * Unit tests for applyRestaurantTranslation — pure function, no DB/server.
 */

import { applyRestaurantTranslation } from "../apply-restaurant-translation";
import type { RestaurantDetail } from "@/lib/types";

function makeDetail(overrides: Partial<RestaurantDetail> = {}): RestaurantDetail {
  return {
    id: "r1",
    slug: "test-restaurant",
    name: "Test Restaurant",
    cuisines: ["Romanian"],
    priceLevel: 2,
    zone: "Centru",
    city: "București",
    rating: 4.5,
    voteCount: 10,
    photoUrl: null,
    photoCount: 0,
    status: "open",
    availableSlots: [],
    lat: null,
    lng: null,
    description: "Original RO description",
    heroNote: "Original RO hero note",
    photos: [],
    schedule: [],
    address: "Strada Test 1",
    tags: [],
    reviewIntelligence: null,
    reviews: [],
    nearby: [],
    chefPicks: [],
    eventsIntakeEnabled: false,
    acceptedOccasions: [],
    ...overrides,
  };
}

describe("applyRestaurantTranslation", () => {
  describe("RO passthrough (null row)", () => {
    it("returns the original detail unchanged when row is null", () => {
      const detail = makeDetail();
      const result = applyRestaurantTranslation(detail, null);
      expect(result).toBe(detail); // referential equality — no copy made
    });
  });

  describe("EN overlay — complete row", () => {
    it("overlays description from descriptionLong when present", () => {
      const detail = makeDetail({ description: "RO desc", heroNote: "RO hero" });
      const row = {
        descriptionShort: "EN short desc",
        descriptionLong: "EN long description text",
        heroSubtitle: "EN hero note",
      };
      const result = applyRestaurantTranslation(detail, row);
      expect(result.description).toBe("EN long description text");
      expect(result.heroNote).toBe("EN hero note");
    });

    it("falls back to descriptionShort when descriptionLong is empty", () => {
      const detail = makeDetail({ description: "RO desc" });
      const row = {
        descriptionShort: "EN short",
        descriptionLong: "",
        heroSubtitle: null,
      };
      const result = applyRestaurantTranslation(detail, row);
      expect(result.description).toBe("EN short");
    });

    it("falls back to descriptionShort when descriptionLong is null", () => {
      const detail = makeDetail({ description: "RO desc" });
      const row = {
        descriptionShort: "EN short only",
        descriptionLong: null,
        heroSubtitle: null,
      };
      const result = applyRestaurantTranslation(detail, row);
      expect(result.description).toBe("EN short only");
    });

    it("does not overlay heroNote when heroSubtitle is null", () => {
      const detail = makeDetail({ heroNote: "RO hero" });
      const row = {
        descriptionShort: "EN short",
        descriptionLong: "EN long",
        heroSubtitle: null,
      };
      const result = applyRestaurantTranslation(detail, row);
      expect(result.heroNote).toBe("RO hero");
    });

    it("does not overlay description when both descriptionLong and descriptionShort are empty", () => {
      const detail = makeDetail({ description: "RO desc" });
      const row = {
        descriptionShort: "",
        descriptionLong: null,
        heroSubtitle: "EN hero",
      };
      const result = applyRestaurantTranslation(detail, row);
      expect(result.description).toBe("RO desc");
    });
  });

  describe("Fallback when EN row is incomplete (usedFallback=true → caller passes null)", () => {
    it("keeps original RO description when row is null (caller handles fallback)", () => {
      const detail = makeDetail({ description: "RO desc original" });
      const result = applyRestaurantTranslation(detail, null);
      expect(result.description).toBe("RO desc original");
    });
  });

  describe("Object shape stability", () => {
    it("returns a new object (not mutating original)", () => {
      const detail = makeDetail({ description: "RO desc" });
      const row = { descriptionShort: "EN", descriptionLong: "EN long", heroSubtitle: "EN hero" };
      const result = applyRestaurantTranslation(detail, row);
      expect(result).not.toBe(detail);
      expect(detail.description).toBe("RO desc"); // original unchanged
    });

    it("preserves all other RestaurantDetail fields unchanged", () => {
      const detail = makeDetail({
        name: "My Restaurant",
        address: "Str. Test 5",
        rating: 4.8,
        eventsIntakeEnabled: true,
      });
      const row = {
        descriptionShort: "EN short",
        descriptionLong: "EN long",
        heroSubtitle: "EN hero",
      };
      const result = applyRestaurantTranslation(detail, row);
      expect(result.name).toBe("My Restaurant");
      expect(result.address).toBe("Str. Test 5");
      expect(result.rating).toBe(4.8);
      expect(result.eventsIntakeEnabled).toBe(true);
    });
  });
});
