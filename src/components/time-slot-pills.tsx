"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/messages-provider";

interface TimeSlotPillsProps {
  slots: string[];
  selected?: string;
  maxVisible?: number;
  /** When true (default), filter out HH:MM slots that are already in the past
   *  relative to the client's local clock. SSR renders the unfiltered list so
   *  there's no hydration mismatch — the filter applies after mount. */
  filterPast?: boolean;
  /**
   * Booking deep-link for a slot. Supplied wherever tapping a slot NAVIGATES
   * to the venue (listings, map) — the pill is then a real anchor, so the
   * deep-link is crawlable and ⌘-click / middle-click work.
   *
   * Omitted on the venue page itself, where a slot opens the reservation sheet
   * in place. That is an action, not a destination, and must stay a <button>.
   */
  hrefForSlot?: (slot: string) => string;
  /** Destination for the "more"/"another day" pill, under the same rule. */
  moreHref?: string;
  onSelect?: (slot: string) => void;
  onMore?: () => void;
}

/**
 * One pill, rendered as an anchor when it goes somewhere and a button when it
 * does something. Identical styling either way; `onNavigate` fires only for a
 * plain same-tab click, so the caller keeps its transition-based pending state
 * while the browser still owns modified clicks.
 */
function Pill({
  href,
  onActivate,
  className,
  children,
}: {
  href?: string;
  onActivate?: () => void;
  className: string;
  children: React.ReactNode;
}) {
  if (href) {
    return (
      <Link
        href={href}
        className={className}
        onNavigate={
          onActivate
            ? (e) => {
                e.preventDefault();
                onActivate();
              }
            : undefined
        }
      >
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onActivate}>
      {children}
    </button>
  );
}

export function TimeSlotPills({
  slots,
  selected,
  maxVisible = 4,
  filterPast = true,
  hrefForSlot,
  moreHref,
  onSelect,
  onMore,
}: TimeSlotPillsProps) {
  const t = useT("booking");
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
        <Pill
          href={moreHref}
          onActivate={onMore}
          className="text-brand-primary text-sm font-semibold inline-flex min-h-[24px] items-center gap-1 px-1 py-1 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          {t("slots.anotherDay")}
        </Pill>
      </div>
    );
  }

  const visible = effectiveSlots.slice(0, maxVisible);
  const hasMore = effectiveSlots.length > maxVisible;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {visible.map((slot) => (
        <Pill
          key={slot}
          href={hrefForSlot?.(slot)}
          onActivate={onSelect ? () => onSelect(slot) : undefined}
          className={[
            "rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
            slot === selected
              ? "bg-brand-primary text-white"
              : "bg-brand-primary-soft text-brand-primary-dark hover:bg-brand-primary-soft/70",
          ].join(" ")}
        >
          {slot}
        </Pill>
      ))}
      {hasMore && (
        <Pill
          href={moreHref}
          onActivate={onMore}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-primary cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          {t("slots.more")}
        </Pill>
      )}
    </div>
  );
}
