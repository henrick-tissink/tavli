"use client";
import { useState } from "react";
import { Briefcase, ChevronRight } from "lucide-react";
import { MeetingSpaceSheetV2 } from "./meeting-space-sheet-v2";
import { useT } from "@/lib/i18n/messages-provider";
import type { MeetingSpaceTile } from "./meeting-space-sheet-v2/types";

interface Props {
  enabled: boolean;
  restaurantId: string;
  restaurantName: string;
  spaces: MeetingSpaceTile[];
}

export function MeetingSpaceCta({ enabled, restaurantId, restaurantName, spaces }: Props) {
  const t = useT("meetingSpaces");
  const [open, setOpen] = useState(false);
  if (!enabled || spaces.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full rounded-card border border-border bg-gradient-to-br from-[var(--color-occasion-corporate-soft)] via-surface-white to-surface-white hover:shadow-card-hover transition-shadow text-left p-4 flex items-center gap-3"
      >
        <span className="shrink-0 rounded-full bg-surface-white p-2 shadow-card">
          <Briefcase className="w-5 h-5 text-brand-primary" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-text-primary">{t("cta.title")}</span>
          <span className="block text-xs text-text-secondary mt-0.5">{t("cta.subtitle")}</span>
        </span>
        <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-brand-primary transition-colors" />
      </button>
      {open && (
        <MeetingSpaceSheetV2
          open={open}
          onClose={() => setOpen(false)}
          restaurantId={restaurantId}
          restaurantName={restaurantName}
          spaces={spaces}
        />
      )}
    </>
  );
}
