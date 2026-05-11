"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Pill } from "@/components/pill";
import { PillPopover } from "@/components/pill-popover";
import { useFilters } from "@/lib/filter-context";
import type { Restaurant } from "@/lib/types";
import { cuisineLabel } from "@/lib/types";

interface FilterPillBarProps {
  restaurants: Restaurant[];
  injectedPills?: { label: string; icon: string }[];
  onOpenAdvanced: () => void;
}

const PRICE_OPTIONS = [
  { value: 1, label: "$" },
  { value: 2, label: "$$" },
  { value: 3, label: "$$$" },
  { value: 4, label: "$$$$" },
];

type PopoverKey = "cuisine" | "price" | "zone";

export function FilterPillBar({
  restaurants,
  injectedPills,
  onOpenAdvanced,
}: FilterPillBarProps) {
  const {
    filters,
    setFilter,
    toggleArrayFilter,
    resetFilters,
    activeFilterCount,
  } = useFilters();

  const cuisineBtnRef = useRef<HTMLButtonElement>(null);
  const priceBtnRef = useRef<HTMLButtonElement>(null);
  const zoneBtnRef = useRef<HTMLButtonElement>(null);

  const cuisinePopoverId = useId();
  const pricePopoverId = useId();
  const zonePopoverId = useId();

  const [openPopover, setOpenPopover] = useState<PopoverKey | null>(null);
  const [activeInjectedPills, setActiveInjectedPills] = useState<string[]>([]);

  // Drop any active injected pill whose label is no longer offered (e.g. time
  // of day rolls over and the "Brunch" chip disappears). Without this the
  // ghost label would keep "Toate" inactive forever.
  useEffect(() => {
    const offered = new Set((injectedPills ?? []).map((p) => p.label));
    setActiveInjectedPills((prev) => prev.filter((p) => offered.has(p)));
  }, [injectedPills]);

  const cuisines = useMemo(
    () =>
      [...new Set(restaurants.flatMap((r) => r.cuisines))].sort((a, b) =>
        cuisineLabel(a).localeCompare(cuisineLabel(b), "ro"),
      ),
    [restaurants],
  );
  const neighborhoods = useMemo(
    () =>
      [...new Set(restaurants.map((r) => r.zone).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "ro"),
      ),
    [restaurants],
  );

  const nothingSelected =
    activeFilterCount === 0 && activeInjectedPills.length === 0;

  const cuisineCount = filters.cuisines.length;
  const priceCount = filters.priceRange.length;
  const zoneCount = filters.neighborhoods.length;
  const advancedActive = filters.minRating > 0;

  const togglePopover = (key: PopoverKey) =>
    setOpenPopover((curr) => (curr === key ? null : key));

  return (
    <div className="sticky top-0 z-10 bg-surface-bg py-3">
      <div className="relative max-w-[var(--container-content)] mx-auto">
        <div className="px-4 desktop:px-6 flex gap-2 overflow-x-auto hide-scrollbar">
        <Pill
          label="Toate"
          active={nothingSelected}
          onToggle={() => {
            resetFilters();
            setActiveInjectedPills([]);
            setOpenPopover(null);
          }}
        />

        <Pill
          label="Deschis acum"
          active={filters.openNow}
          onToggle={() => setFilter("openNow", !filters.openNow)}
        />

        {injectedPills?.map((pill) => (
          <Pill
            key={`injected-${pill.label}`}
            label={pill.label}
            icon={pill.icon}
            active={activeInjectedPills.includes(pill.label)}
            onToggle={() =>
              setActiveInjectedPills((prev) =>
                prev.includes(pill.label)
                  ? prev.filter((p) => p !== pill.label)
                  : [...prev, pill.label],
              )
            }
          />
        ))}

        {cuisines.length > 0 && (
          <PopoverPill
            buttonRef={cuisineBtnRef}
            popoverId={cuisinePopoverId}
            label="Bucătărie"
            count={cuisineCount}
            open={openPopover === "cuisine"}
            onToggle={() => togglePopover("cuisine")}
          />
        )}

        <PopoverPill
          buttonRef={priceBtnRef}
          popoverId={pricePopoverId}
          label="Preț"
          count={priceCount}
          open={openPopover === "price"}
          onToggle={() => togglePopover("price")}
        />

        {neighborhoods.length > 0 && (
          <PopoverPill
            buttonRef={zoneBtnRef}
            popoverId={zonePopoverId}
            label="Cartier"
            count={zoneCount}
            open={openPopover === "zone"}
            onToggle={() => togglePopover("zone")}
          />
        )}

        <button
          type="button"
          onClick={onOpenAdvanced}
          aria-label="Mai multe filtre"
          className={[
            "rounded-pill px-3 py-1.5 text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5",
            advancedActive
              ? "bg-brand-primary text-white"
              : "bg-surface-bg text-text-secondary border border-border",
          ].join(" ")}
        >
          <SlidersHorizontal size={14} />
          Filtre
          {advancedActive && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-white/25 text-[10px] font-bold">
              1
            </span>
          )}
        </button>
        </div>
        {/* Right-edge fade hint — signals horizontal scroll on viewports where pills overflow. */}
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 w-8 pointer-events-none bg-gradient-to-l from-surface-bg to-transparent desktop:hidden"
        />
      </div>

      <PillPopover
        id={cuisinePopoverId}
        open={openPopover === "cuisine"}
        onClose={() => setOpenPopover(null)}
        anchorRef={cuisineBtnRef}
        title="Bucătărie"
        onClear={
          cuisineCount > 0 ? () => setFilter("cuisines", []) : undefined
        }
      >
        <ChecklistBody
          items={cuisines.map((c) => ({ value: c, label: cuisineLabel(c) }))}
          selected={filters.cuisines}
          onToggle={(v) => toggleArrayFilter("cuisines", v)}
        />
      </PillPopover>

      <PillPopover
        id={pricePopoverId}
        open={openPopover === "price"}
        onClose={() => setOpenPopover(null)}
        anchorRef={priceBtnRef}
        title="Preț"
        onClear={
          priceCount > 0 ? () => setFilter("priceRange", []) : undefined
        }
        width={220}
      >
        <PriceBody
          selected={filters.priceRange}
          onToggle={(v) => toggleArrayFilter("priceRange", v)}
        />
      </PillPopover>

      <PillPopover
        id={zonePopoverId}
        open={openPopover === "zone"}
        onClose={() => setOpenPopover(null)}
        anchorRef={zoneBtnRef}
        title="Cartier"
        onClear={
          zoneCount > 0 ? () => setFilter("neighborhoods", []) : undefined
        }
      >
        <ChecklistBody
          items={neighborhoods.map((n) => ({ value: n, label: n }))}
          selected={filters.neighborhoods}
          onToggle={(v) => toggleArrayFilter("neighborhoods", v)}
        />
      </PillPopover>
    </div>
  );
}

function PopoverPill({
  buttonRef,
  popoverId,
  label,
  count,
  open,
  onToggle,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  popoverId: string;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const active = count > 0;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={popoverId}
      className={[
        "rounded-pill px-3 py-1.5 text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1",
        active
          ? "bg-brand-primary text-white"
          : "bg-surface-bg text-text-secondary",
      ].join(" ")}
    >
      <span>{label}</span>
      {active && (
        <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-white/25 text-[10px] font-bold">
          {count}
        </span>
      )}
      <ChevronDown
        size={14}
        className={`transition-transform ${open ? "rotate-180" : ""}`}
        aria-hidden
      />
    </button>
  );
}

function ChecklistBody<T extends string>({
  items,
  selected,
  onToggle,
}: {
  items: { value: T; label: string }[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  const selectedSet = useMemo(
    () => new Set(selected.map((s) => s.toLowerCase())),
    [selected],
  );

  return (
    <ul className="py-1">
      {items.map((item) => {
        const isOn = selectedSet.has(item.value.toLowerCase());
        return (
          <li key={item.value}>
            <button
              type="button"
              onClick={() => onToggle(item.value)}
              aria-pressed={isOn}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-text-primary hover:bg-surface-bg text-left"
            >
              <span className={isOn ? "font-semibold" : ""}>{item.label}</span>
              <span
                className={[
                  "w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border transition-colors",
                  isOn
                    ? "bg-brand-primary border-brand-primary text-white"
                    : "bg-surface-white border-border",
                ].join(" ")}
                aria-hidden
              >
                {isOn && <Check size={14} strokeWidth={3} />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PriceBody({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5 p-3">
      {PRICE_OPTIONS.map(({ value, label }) => {
        const isOn = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            aria-pressed={isOn}
            className={[
              "rounded-button py-2 text-sm font-bold transition-colors",
              isOn
                ? "bg-brand-primary text-white"
                : "bg-surface-bg text-text-secondary hover:bg-surface-bg/80",
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
