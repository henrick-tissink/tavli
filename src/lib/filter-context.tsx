"use client";

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { Restaurant } from "@/lib/types";

export type CapabilityFilter =
  | "events"
  | "meetings"
  | "standing"
  | "corporate_meals";

export interface FilterState {
  openNow: boolean;
  cuisines: string[];
  priceRange: number[];
  neighborhoods: string[];
  minRating: number; // 0=any, 3, 4, 4.5, 5
  searchQuery: string;
}

const DEFAULT_FILTERS: FilterState = {
  openNow: false,
  cuisines: [],
  priceRange: [],
  neighborhoods: [],
  minRating: 0,
  searchQuery: "",
};

interface FilterContextValue {
  filters: FilterState;
  setFilter: (key: keyof FilterState, value: any) => void;
  toggleArrayFilter: (
    key: "cuisines" | "priceRange" | "neighborhoods",
    value: string | number,
  ) => void;
  resetFilters: () => void;
  activeFilterCount: number;
  applyFilters: (restaurants: Restaurant[]) => Restaurant[];
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS });

  const setFilter = useCallback((key: keyof FilterState, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleArrayFilter = useCallback(
    (
      key: "cuisines" | "priceRange" | "neighborhoods",
      value: string | number,
    ) => {
      setFilters((prev) => {
        const arr = prev[key] as (string | number)[];
        const exists = arr.includes(value);
        return {
          ...prev,
          [key]: exists ? arr.filter((v) => v !== value) : [...arr, value],
        };
      });
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.openNow) count++;
    count += filters.cuisines.length;
    count += filters.priceRange.length;
    count += filters.neighborhoods.length;
    if (filters.minRating > 0) count++;
    if (filters.searchQuery.length > 0) count++;
    return count;
  }, [filters]);

  const applyFilters = useCallback(
    (restaurants: Restaurant[]) => {
      let result = restaurants;

      if (filters.openNow) {
        result = result.filter((r) => r.status === "open");
      }

      if (filters.cuisines.length > 0) {
        result = result.filter((r) =>
          filters.cuisines.some((c) =>
            r.cuisines.some(
              (rc) => rc.toLowerCase() === c.toLowerCase(),
            ),
          ),
        );
      }

      if (filters.priceRange.length > 0) {
        result = result.filter((r) => filters.priceRange.includes(r.priceLevel));
      }

      if (filters.neighborhoods.length > 0) {
        result = result.filter((r) =>
          filters.neighborhoods.some((n) => r.zone.toLowerCase() === n.toLowerCase()),
        );
      }

      if (filters.minRating > 0) {
        result = result.filter((r) => r.rating >= filters.minRating);
      }

      if (filters.searchQuery.length > 0) {
        const q = filters.searchQuery.toLowerCase();
        result = result.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.cuisines.some((c) => c.toLowerCase().includes(q)),
        );
      }

      return result;
    },
    [filters],
  );

  const value = useMemo<FilterContextValue>(
    () => ({
      filters,
      setFilter,
      toggleArrayFilter,
      resetFilters,
      activeFilterCount,
      applyFilters,
    }),
    [
      filters,
      setFilter,
      toggleArrayFilter,
      resetFilters,
      activeFilterCount,
      applyFilters,
    ],
  );

  return <FilterContext value={value}>{children}</FilterContext>;
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error("useFilters must be used within a FilterProvider");
  }
  return ctx;
}
