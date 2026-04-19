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
  injectedPills?: { label: string; icon: string }[];
}

export function FilterPillBar({
  activePills,
  onPillToggle,
  onDropdownOpen,
  injectedPills,
}: FilterPillBarProps) {
  // Split default pills: "All" first, then the rest
  const allPill = DEFAULT_PILLS[0]; // "All"
  const restPills = DEFAULT_PILLS.slice(1); // "Open Now", "Cuisine", etc.

  return (
    <div className="sticky top-0 z-10 bg-surface-bg py-3">
      <div className="max-w-[var(--container-content)] mx-auto px-4 desktop:px-6 flex gap-2 overflow-x-auto hide-scrollbar">
        {/* "All" pill */}
        <Pill
          key={allPill.label}
          label={allPill.label}
          active={activePills.includes(allPill.label)}
          hasDropdown={allPill.hasDropdown}
          onToggle={() => onPillToggle(allPill.label)}
        />

        {/* Time-injected pills */}
        {injectedPills?.map((pill) => (
          <Pill
            key={`injected-${pill.label}`}
            label={pill.label}
            icon={pill.icon}
            onToggle={() => onPillToggle(pill.label)}
          />
        ))}

        {/* Remaining default pills */}
        {restPills.map((pill) => (
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
    </div>
  );
}
