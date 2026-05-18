"use client";

import { DayPicker } from "react-day-picker";
import { ro } from "date-fns/locale";
import "react-day-picker/style.css";
import { isoDate, addDays, localDateFromIso } from "./helpers";

interface StepDateProps {
  value: string | null; // ISO yyyy-mm-dd
  onSelect: (iso: string) => void;
}

export function StepDate({ value, onSelect }: StepDateProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = addDays(today, 90);

  const selected = value ? localDateFromIso(value) : undefined;

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
        Pas 1 din 4
      </p>
      <h2 className="font-display text-xl font-bold text-text-primary">
        Când vrei să rezervi?
      </h2>

      {/* Chip shortcuts */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSelect(isoDate(today))}
          className="px-4 py-2 rounded-pill border border-border text-sm font-semibold text-text-primary bg-surface-white hover:bg-surface-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          Astăzi
        </button>
        <button
          type="button"
          onClick={() => onSelect(isoDate(addDays(today, 1)))}
          className="px-4 py-2 rounded-pill border border-border text-sm font-semibold text-text-primary bg-surface-white hover:bg-surface-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          Mâine
        </button>
      </div>

      {/* Calendar */}
      <div className="flex justify-center">
        <DayPicker
          mode="single"
          locale={ro}
          weekStartsOn={1}
          selected={selected}
          onSelect={(d) => d && onSelect(isoDate(d))}
          disabled={[{ before: today }, { after: maxDate }]}
          modifiersClassNames={{
            selected: "bg-brand-primary text-white rounded-full",
            disabled: "opacity-40 cursor-not-allowed",
          }}
        />
      </div>

      {selected && (
        <p className="text-sm text-center text-text-secondary">
          {new Intl.DateTimeFormat("ro-RO", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(selected)}
        </p>
      )}
    </div>
  );
}
