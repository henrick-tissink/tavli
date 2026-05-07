"use client";

import type { MenuDietaryTag } from "@/lib/types";

export type DietaryFilter = Extract<
  MenuDietaryTag,
  "vegan" | "vegetarian" | "gluten-free" | "spicy"
>;

interface DietaryFilterRowProps {
  activeFilters: Set<DietaryFilter>;
  onToggle: (filter: DietaryFilter) => void;
  onClear: () => void;
}

const FILTERS: { value: DietaryFilter; label: string; icon: string }[] = [
  { value: "vegan", label: "Vegan", icon: "🌱" },
  { value: "vegetarian", label: "Vegetarian", icon: "🥗" },
  { value: "gluten-free", label: "Fără gluten", icon: "🌾" },
  { value: "spicy", label: "Picant", icon: "🌶" },
];

export function DietaryFilterRow({
  activeFilters,
  onToggle,
  onClear,
}: DietaryFilterRowProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
      {FILTERS.map((filter) => {
        const active = activeFilters.has(filter.value);
        const classes = [
          "rounded-pill px-3.5 py-1 text-xs font-semibold flex items-center gap-1 whitespace-nowrap",
          active
            ? "bg-brand-primary-soft text-brand-primary-dark border border-brand-primary/30"
            : "bg-surface-white text-text-secondary border border-border hover:bg-surface-bg",
        ].join(" ");
        return (
          <button
            key={filter.value}
            type="button"
            onClick={() => onToggle(filter.value)}
            className={classes}
            aria-pressed={active}
          >
            <span>{filter.icon}</span>
            <span>{filter.label}</span>
          </button>
        );
      })}
      {activeFilters.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-semibold text-text-secondary underline-offset-2 hover:underline whitespace-nowrap"
        >
          Șterge
        </button>
      )}
    </div>
  );
}
