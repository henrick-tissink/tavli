"use client";
import { useState } from "react";
import { CalendarHeart, ChevronRight } from "lucide-react";
import { EventRequestSheetV2 } from "./event-request-sheet-v2";
import type {
  Occasion,
  PrivateSpaceTile,
} from "./event-request-sheet-v2/types";

interface Props {
  enabled: boolean;
  restaurantId: string;
  restaurantName: string;
  acceptedOccasions: Occasion[];
  privateSpaces: PrivateSpaceTile[];
  minLeadDays?: number;
  budgetPerHeadGuidance?: string | null;
}

export function EventRequestCtaV2({
  enabled,
  restaurantId,
  restaurantName,
  acceptedOccasions,
  privateSpaces,
  minLeadDays,
  budgetPerHeadGuidance,
}: Props) {
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full rounded-card border border-border bg-gradient-to-br from-[var(--color-occasion-wedding-soft)] via-surface-white to-[var(--color-occasion-corporate-soft)] hover:shadow-card-hover transition-shadow text-left p-4 flex items-center gap-3"
      >
        <span className="shrink-0 rounded-full bg-surface-white p-2 shadow-card">
          <CalendarHeart className="w-5 h-5 text-[var(--color-occasion-wedding)]" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-text-primary">
            Organizează un eveniment privat
          </span>
          <span className="block text-xs text-text-secondary mt-0.5">
            Nuntă, aniversare, cină corporate · răspuns în mai puțin de 24 de ore
          </span>
        </span>
        <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-brand-primary transition-colors" />
      </button>
      {open && (
        <EventRequestSheetV2
          open={open}
          onClose={() => setOpen(false)}
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          acceptedOccasions={acceptedOccasions}
          privateSpaces={privateSpaces}
          minLeadDays={minLeadDays}
          budgetPerHeadGuidance={budgetPerHeadGuidance}
        />
      )}
    </>
  );
}
