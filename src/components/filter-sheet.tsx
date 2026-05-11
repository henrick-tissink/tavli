"use client";

import { BottomSheet } from "@/components/bottom-sheet";
import { Pill } from "@/components/pill";
import { Button } from "@/components/button";
import { useFilters } from "@/lib/filter-context";
import type { Restaurant } from "@/lib/types";
import { cuisineLabel } from "@/lib/types";
import { useMemo } from "react";

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  resultCount: number;
  restaurants?: Restaurant[];
}

const PRICE_OPTIONS = [
  { value: 1, label: "$ Accesibil" },
  { value: 2, label: "$$ Moderat" },
  { value: 3, label: "$$$ Premium" },
  { value: 4, label: "$$$$ Exclusivist" },
];

const RATING_OPTIONS = [
  { value: 0, label: "Oricare" },
  { value: 3, label: "3+" },
  { value: 4, label: "4+" },
  { value: 4.5, label: "4.5+" },
  { value: 5, label: "5" },
];

export function FilterSheet({
  open,
  onClose,
  resultCount,
  restaurants = [],
}: FilterSheetProps) {
  const { filters, toggleArrayFilter, setFilter, resetFilters, activeFilterCount } = useFilters();

  const cuisines = useMemo(() => {
    const all = restaurants.flatMap((r) => r.cuisines);
    return [...new Set(all)].sort((a, b) =>
      cuisineLabel(a).localeCompare(cuisineLabel(b), "ro"),
    );
  }, [restaurants]);

  const neighborhoods = useMemo(() => {
    const all = restaurants.map((r) => r.zone).filter(Boolean);
    return [...new Set(all)].sort((a, b) => a.localeCompare(b, "ro"));
  }, [restaurants]);

  return (
    <BottomSheet open={open} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-text-primary">Filtre</h2>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm font-semibold text-brand-primary"
          >
            Resetează
          </button>
        )}
      </div>

      {/* Cuisine */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Bucătărie</h3>
        <div className="flex flex-wrap gap-2">
          {cuisines.map((cuisine) => (
            <Pill
              key={cuisine}
              label={cuisineLabel(cuisine)}
              active={filters.cuisines.some((c) => c.toLowerCase() === cuisine.toLowerCase())}
              onToggle={() => toggleArrayFilter("cuisines", cuisine)}
            />
          ))}
        </div>
      </div>

      {/* Price */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Preț</h3>
        <div className="grid grid-cols-2 gap-2">
          {PRICE_OPTIONS.map(({ value, label }) => {
            const isOn = filters.priceRange.includes(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleArrayFilter("priceRange", value)}
                aria-pressed={isOn}
                className={[
                  "rounded-button px-4 py-3 text-sm font-semibold text-center transition-all",
                  isOn
                    ? "bg-brand-primary text-white"
                    : "bg-surface-bg text-text-secondary",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Neighborhood */}
      <div className="space-y-3 mb-6">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
          Cartier
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
          Rating minim
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

      {/* Sticky bottom button */}
      <div className="sticky bottom-0 bg-surface-white pt-3 pb-1">
        <Button fullWidth onClick={onClose} disabled={resultCount === 0}>
          {resultCount === 0 ? "Niciun rezultat" : `Arată ${resultCount} ${resultCount === 1 ? "rezultat" : "rezultate"}`}
        </Button>
      </div>
    </BottomSheet>
  );
}
