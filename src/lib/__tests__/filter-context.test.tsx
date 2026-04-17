import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterProvider, useFilters } from "../filter-context";
import type { Restaurant } from "@/lib/types";

/* Helper that renders a consumer exposing the context value */
function TestConsumer({ onRender }: { onRender: (ctx: ReturnType<typeof useFilters>) => void }) {
  const ctx = useFilters();
  onRender(ctx);
  return null;
}

function renderWithProvider() {
  let ctx!: ReturnType<typeof useFilters>;
  render(
    <FilterProvider>
      <TestConsumer onRender={(c) => { ctx = c; }} />
    </FilterProvider>,
  );
  return () => ctx;
}

const makeRestaurant = (overrides: Partial<Restaurant> = {}): Restaurant => ({
  id: "1",
  slug: "test",
  name: "Test Restaurant",
  cuisine: "Italian",
  priceLevel: 2,
  zone: "Centru Vechi",
  city: "București",
  rating: 4.5,
  voteCount: 100,
  photoUrl: null,
  photoCount: 0,
  status: "open",
  availableSlots: [],
  ...overrides,
});

describe("FilterContext", () => {
  it("provides default empty state", () => {
    const getCtx = renderWithProvider();
    const { filters } = getCtx();
    expect(filters.openNow).toBe(false);
    expect(filters.cuisines).toEqual([]);
    expect(filters.priceRange).toEqual([]);
    expect(filters.neighborhoods).toEqual([]);
    expect(filters.minRating).toBe(0);
    expect(filters.venueTypes).toEqual([]);
    expect(filters.collections).toEqual([]);
    expect(filters.searchQuery).toBe("");
  });

  it("setFilter updates a value", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().setFilter("openNow", true); });
    expect(getCtx().filters.openNow).toBe(true);
  });

  it("setFilter updates searchQuery", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().setFilter("searchQuery", "sushi"); });
    expect(getCtx().filters.searchQuery).toBe("sushi");
  });

  it("toggleArrayFilter adds a value", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().toggleArrayFilter("cuisines", "Italian"); });
    expect(getCtx().filters.cuisines).toEqual(["Italian"]);
  });

  it("toggleArrayFilter removes an existing value", () => {
    const getCtx = renderWithProvider();
    act(() => { getCtx().toggleArrayFilter("cuisines", "Italian"); });
    act(() => { getCtx().toggleArrayFilter("cuisines", "Italian"); });
    expect(getCtx().filters.cuisines).toEqual([]);
  });

  it("resetFilters clears all", () => {
    const getCtx = renderWithProvider();
    act(() => {
      getCtx().setFilter("openNow", true);
      getCtx().toggleArrayFilter("cuisines", "Italian");
      getCtx().setFilter("minRating", 4);
    });
    act(() => { getCtx().resetFilters(); });
    expect(getCtx().filters.openNow).toBe(false);
    expect(getCtx().filters.cuisines).toEqual([]);
    expect(getCtx().filters.minRating).toBe(0);
  });

  it("activeFilterCount counts active filters", () => {
    const getCtx = renderWithProvider();
    expect(getCtx().activeFilterCount).toBe(0);
    act(() => {
      getCtx().setFilter("openNow", true);
      getCtx().toggleArrayFilter("cuisines", "Italian");
      getCtx().toggleArrayFilter("cuisines", "French");
      getCtx().setFilter("minRating", 4);
    });
    // openNow (1) + 2 cuisines + minRating (1) = 4
    expect(getCtx().activeFilterCount).toBe(4);
  });

  describe("applyFilters", () => {
    it("filters by openNow", () => {
      const getCtx = renderWithProvider();
      act(() => { getCtx().setFilter("openNow", true); });

      const restaurants = [
        makeRestaurant({ id: "1", status: "open" }),
        makeRestaurant({ id: "2", status: "closed" }),
      ];
      const result = getCtx().applyFilters(restaurants);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("filters by cuisine (case-insensitive)", () => {
      const getCtx = renderWithProvider();
      act(() => { getCtx().toggleArrayFilter("cuisines", "italian"); });

      const restaurants = [
        makeRestaurant({ id: "1", cuisine: "Italian" }),
        makeRestaurant({ id: "2", cuisine: "French" }),
      ];
      const result = getCtx().applyFilters(restaurants);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("filters by priceRange", () => {
      const getCtx = renderWithProvider();
      act(() => { getCtx().toggleArrayFilter("priceRange", 1); });

      const restaurants = [
        makeRestaurant({ id: "1", priceLevel: 1 }),
        makeRestaurant({ id: "2", priceLevel: 3 }),
      ];
      const result = getCtx().applyFilters(restaurants);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("filters by rating", () => {
      const getCtx = renderWithProvider();
      act(() => { getCtx().setFilter("minRating", 4.5); });

      const restaurants = [
        makeRestaurant({ id: "1", rating: 4.8 }),
        makeRestaurant({ id: "2", rating: 4.2 }),
      ];
      const result = getCtx().applyFilters(restaurants);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("filters by searchQuery on name and cuisine", () => {
      const getCtx = renderWithProvider();
      act(() => { getCtx().setFilter("searchQuery", "sushi"); });

      const restaurants = [
        makeRestaurant({ id: "1", name: "Sakura Sushi", cuisine: "Japanese" }),
        makeRestaurant({ id: "2", name: "Casa Veche", cuisine: "Romanian" }),
      ];
      const result = getCtx().applyFilters(restaurants);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });

    it("chains multiple filters", () => {
      const getCtx = renderWithProvider();
      act(() => {
        getCtx().setFilter("openNow", true);
        getCtx().toggleArrayFilter("cuisines", "Italian");
      });

      const restaurants = [
        makeRestaurant({ id: "1", status: "open", cuisine: "Italian" }),
        makeRestaurant({ id: "2", status: "open", cuisine: "French" }),
        makeRestaurant({ id: "3", status: "closed", cuisine: "Italian" }),
      ];
      const result = getCtx().applyFilters(restaurants);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
    });
  });
});
