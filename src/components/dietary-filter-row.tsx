"use client";

import type { MenuDietaryTag } from "@/lib/types";
import { useT } from "@/lib/i18n/messages-provider";

export type DietaryFilter = Extract<
  MenuDietaryTag,
  "vegan" | "vegetarian" | "gluten-free" | "spicy"
>;

interface DietaryFilterRowProps {
  activeFilters: Set<DietaryFilter>;
  onToggle: (filter: DietaryFilter) => void;
  onClear: () => void;
}

type FilterDef = { value: DietaryFilter; icon: string };

const FILTER_DEFS: FilterDef[] = [
  { value: "vegan", icon: "🌱" },
  { value: "vegetarian", icon: "🥗" },
  { value: "gluten-free", icon: "🌾" },
  { value: "spicy", icon: "🌶" },
];

export function DietaryFilterRow({
  activeFilters,
  onToggle,
  onClear,
}: DietaryFilterRowProps) {
  const t = useT("discovery");

  const LABEL_MAP: Record<DietaryFilter, string> = {
    vegan: t("dietary.vegan"),
    vegetarian: t("dietary.vegetarian"),
    "gluten-free": t("dietary.glutenFree"),
    spicy: t("dietary.spicy"),
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
      {FILTER_DEFS.map((filter) => {
        const active = activeFilters.has(filter.value);
        const label = LABEL_MAP[filter.value];
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
            <span>{label}</span>
          </button>
        );
      })}
      {activeFilters.size > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-semibold text-text-secondary underline-offset-2 hover:underline whitespace-nowrap"
        >
          {t("dietary.clear")}
        </button>
      )}
    </div>
  );
}
