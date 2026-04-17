"use client";

import { BottomSheet } from "@/components/bottom-sheet";
import { Pill } from "@/components/pill";
import { Button } from "@/components/button";
import { useFilters } from "@/lib/filter-context";
import { getRestaurants } from "@/lib/mock-data";
import { useMemo } from "react";

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  resultCount: number;
}

const PRICE_OPTIONS = [
  { value: 1, label: "$ Affordable" },
  { value: 2, label: "$$ Moderate" },
  { value: 3, label: "$$$ Premium" },
  { value: 4, label: "$$$$ Exclusive" },
];

const RATING_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 3, label: "3+" },
  { value: 4, label: "4+" },
  { value: 4.5, label: "4.5+" },
  { value: 5, label: "5" },
];

const VENUE_TYPES = ["Restaurant", "Cafe", "Bar", "Cocktail Bar", "Pub", "Lounge", "Pizzerie"];

const COLLECTIONS = [
  "Recommended",
  "Fine Dining",
  "Dog Friendly",
  "Child Friendly",
  "Romantic",
  "Business",
  "Terrace",
];

export function FilterSheet({ open, onClose, resultCount }: FilterSheetProps) {
  const { filters, toggleArrayFilter, setFilter, resetFilters, activeFilterCount } = useFilters();

  const cuisines = useMemo(() => {
    const all = getRestaurants().map((r) => r.cuisine);
    return [...new Set(all)].sort();
  }, []);

  const neighborhoods = useMemo(() => {
    const all = getRestaurants().map((r) => r.zone);
    return [...new Set(all)].sort();
  }, []);

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-text-primary">Filters</h2>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm font-semibold text-brand-primary"
          >
            Reset
          </button>
        )}
      </div>

      {/* Cuisine */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Cuisine</h3>
        <div className="flex flex-wrap gap-2">
          {cuisines.map((cuisine) => (
            <Pill
              key={cuisine}
              label={cuisine}
              active={filters.cuisines.some((c) => c.toLowerCase() === cuisine.toLowerCase())}
              onToggle={() => toggleArrayFilter("cuisines", cuisine)}
            />
          ))}
        </div>
      </div>

      {/* Price */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Price</h3>
        <div className="grid grid-cols-2 gap-2">
          {PRICE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => toggleArrayFilter("priceRange", value)}
              className={[
                "rounded-button px-4 py-3 text-sm font-semibold text-center transition-all",
                filters.priceRange.includes(value)
                  ? "bg-brand-primary text-white"
                  : "bg-surface-bg text-text-secondary",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Neighborhood */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
          Neighborhood
        </h3>
        <div className="flex flex-wrap gap-2">
          {neighborhoods.map((zone) => (
            <Pill
              key={zone}
              label={zone}
              active={filters.neighborhoods.some((n) => n.toLowerCase() === zone.toLowerCase())}
              onToggle={() => toggleArrayFilter("neighborhoods", zone)}
            />
          ))}
        </div>
      </div>

      {/* Rating */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
          Minimum rating
        </h3>
        <div className="flex flex-wrap gap-2">
          {RATING_OPTIONS.map(({ value, label }) => (
            <Pill
              key={value}
              label={label}
              active={filters.minRating === value}
              onToggle={() => setFilter("minRating", value)}
            />
          ))}
        </div>
      </div>

      {/* Type */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Type</h3>
        <div className="flex flex-wrap gap-2">
          {VENUE_TYPES.map((type) => (
            <Pill
              key={type}
              label={type}
              active={filters.venueTypes.includes(type)}
              onToggle={() => toggleArrayFilter("venueTypes", type)}
            />
          ))}
        </div>
      </div>

      {/* Collection */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
          Collection
        </h3>
        <div className="flex flex-wrap gap-2">
          {COLLECTIONS.map((collection) => (
            <Pill
              key={collection}
              label={collection}
              active={filters.collections.includes(collection)}
              onToggle={() => toggleArrayFilter("collections", collection)}
            />
          ))}
        </div>
      </div>

      {/* Sticky bottom button */}
      <div className="sticky bottom-0 bg-surface-white pt-3 pb-1">
        <Button fullWidth onClick={onClose} disabled={resultCount === 0}>
          {resultCount === 0 ? "No results" : `Show ${resultCount} results`}
        </Button>
      </div>
    </BottomSheet>
  );
}
