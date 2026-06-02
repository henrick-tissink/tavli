"use client";

import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { zoneLabel } from "@/lib/types";

interface StepSlotProps {
  availableSlots: string[]; // e.g. ["18:00", "19:30", "20:00"]
  zones?: string[]; // e.g. ["Terrace", "Indoor"]
  selectedSlot: string | null;
  selectedZone: string | null;
  loading?: boolean;
  onSelectSlot: (slot: string) => void;
  onSelectZone: (zone: string | null) => void;
}

export function StepSlot({
  availableSlots,
  zones,
  selectedSlot,
  selectedZone,
  loading = false,
  onSelectSlot,
  onSelectZone,
}: StepSlotProps) {
  const t = useT("booking");
  const locale = useLocale();
  const hasZones = zones && zones.length > 0;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-text-primary">
        {t("sheet.stepSlot.title")}
      </h2>
      <p className="text-sm text-text-secondary">
        {t("sheet.stepSlot.subtitle")}
      </p>

      {loading ? (
        <div className="grid grid-cols-3 tablet:grid-cols-4 gap-2" aria-label={t("sheet.stepSlot.loadingAriaLabel")} aria-busy="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-11 rounded-button bg-surface-bg animate-pulse" />
          ))}
        </div>
      ) : availableSlots.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-text-secondary">
            {t("sheet.stepSlot.noSlots")}
          </p>
          <p className="text-text-muted text-xs mt-1">{t("sheet.stepSlot.noSlotsHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 tablet:grid-cols-4 gap-2">
          {availableSlots.map((slot) => {
            const isSelected = slot === selectedSlot;
            return (
              <button
                key={slot}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectSlot(slot)}
                className={`h-11 rounded-button border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                  isSelected
                    ? "bg-brand-primary text-white border-brand-primary"
                    : "bg-surface-white text-text-primary border-border hover:bg-surface-bg"
                }`}
              >
                {slot}
              </button>
            );
          })}
        </div>
      )}

      {hasZones && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-text-primary">
            {t("sheet.stepSlot.zoneLabel")}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={selectedZone === null}
              onClick={() => onSelectZone(null)}
              className={`h-9 px-4 text-sm rounded-pill border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                selectedZone === null
                  ? "bg-brand-primary text-white border-brand-primary"
                  : "bg-surface-white text-text-primary border-border hover:bg-surface-bg"
              }`}
            >
              {t("sheet.stepSlot.allZones")}
            </button>
            {zones!.map((zone) => {
              const isSelected = zone === selectedZone;
              return (
                <button
                  key={zone}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelectZone(zone)}
                  className={`h-9 px-4 text-sm rounded-pill border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                    isSelected
                      ? "bg-brand-primary text-white border-brand-primary"
                      : "bg-surface-white text-text-primary border-border hover:bg-surface-bg"
                  }`}
                >
                  {zoneLabel(zone, locale)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
