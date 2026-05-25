"use client";

import { useEffect, useState } from "react";

interface TimeSlotPillsProps {
  slots: string[];
  selected?: string;
  maxVisible?: number;
  /** When true (default), filter out HH:MM slots that are already in the past
   *  relative to the client's local clock. SSR renders the unfiltered list so
   *  there's no hydration mismatch — the filter applies after mount. */
  filterPast?: boolean;
  onSelect?: (slot: string) => void;
  onMore?: () => void;
}

export function TimeSlotPills({
  slots,
  selected,
  maxVisible = 4,
  filterPast = true,
  onSelect,
  onMore,
}: TimeSlotPillsProps) {
  // Drop past slots after mount so SSR matches first render exactly.
  const [cutoff, setCutoff] = useState<string | null>(null);
  useEffect(() => {
    if (!filterPast) return;
    const now = new Date();
    setCutoff(
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );
  }, [filterPast]);

  const effectiveSlots = cutoff ? slots.filter((s) => s > cutoff) : slots;

  if (effectiveSlots.length === 0) {
    return (
      <div className="text-center py-3">
        <button
          type="button"
          className="text-brand-primary text-sm font-semibold inline-flex min-h-[24px] items-center gap-1 px-1 py-1"
          onClick={onMore}
        >
          Rezervă pentru altă zi →
        </button>
      </div>
    );
  }

  const visible = effectiveSlots.slice(0, maxVisible);
  const hasMore = effectiveSlots.length > maxVisible;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {visible.map((slot) => (
        <button
          key={slot}
          type="button"
          onClick={() => onSelect?.(slot)}
          className={[
            "rounded-lg px-3 py-1.5 text-xs font-semibold",
            slot === selected
              ? "bg-brand-primary text-white"
              : "bg-brand-primary-soft text-brand-primary-dark",
          ].join(" ")}
        >
          {slot}
        </button>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={onMore}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-primary"
        >
          Mai multe →
        </button>
      )}
    </div>
  );
}
