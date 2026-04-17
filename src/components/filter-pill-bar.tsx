"use client";

import { Pill } from "@/components/pill";

const DEFAULT_PILLS = [
  { label: "All", hasDropdown: false },
  { label: "Open Now", hasDropdown: false },
  { label: "Cuisine", hasDropdown: true },
  { label: "Price", hasDropdown: true },
  { label: "Distance", hasDropdown: true },
  { label: "More", hasDropdown: true },
];

interface FilterPillBarProps {
  activePills: string[];
  onPillToggle: (pill: string) => void;
  onDropdownOpen: (pill: string) => void;
}

export function FilterPillBar({
  activePills,
  onPillToggle,
  onDropdownOpen,
}: FilterPillBarProps) {
  return (
    <div className="sticky top-0 z-10 overflow-x-auto flex gap-2 py-3 bg-surface-bg hide-scrollbar">
      {DEFAULT_PILLS.map((pill) => (
        <Pill
          key={pill.label}
          label={pill.label}
          active={activePills.includes(pill.label)}
          hasDropdown={pill.hasDropdown}
          onToggle={() => {
            if (pill.hasDropdown) {
              onDropdownOpen(pill.label);
            } else {
              onPillToggle(pill.label);
            }
          }}
        />
      ))}
    </div>
  );
}
