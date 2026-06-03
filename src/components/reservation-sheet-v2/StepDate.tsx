"use client";

import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { isoDate, addDays, localDateFromIso } from "./helpers";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { BCP47 } from "@/lib/i18n/locale";
import { DATE_FNS_LOCALES } from "@/lib/i18n/date-fns-locale";

interface StepDateProps {
  value: string | null; // ISO yyyy-mm-dd
  onSelect: (iso: string) => void;
}

export function StepDate({ value, onSelect }: StepDateProps) {
  const t = useT("booking");
  const locale = useLocale();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = addDays(today, 90);

  const selected = value ? localDateFromIso(value) : undefined;

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-text-primary">
        {t("sheet.stepDate.title")}
      </h2>

      {/* Chip shortcuts */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSelect(isoDate(today))}
          className="px-4 py-2 rounded-pill border border-border text-sm font-semibold text-text-primary bg-surface-white hover:bg-surface-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          {t("sheet.stepDate.today")}
        </button>
        <button
          type="button"
          onClick={() => onSelect(isoDate(addDays(today, 1)))}
          className="px-4 py-2 rounded-pill border border-border text-sm font-semibold text-text-primary bg-surface-white hover:bg-surface-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        >
          {t("sheet.stepDate.tomorrow")}
        </button>
      </div>

      {/* Calendar */}
      <div className="flex justify-center tavli-calendar">
        <DayPicker
          mode="single"
          locale={DATE_FNS_LOCALES[locale]}
          weekStartsOn={1}
          selected={selected}
          onSelect={(d) => d && onSelect(isoDate(d))}
          disabled={[{ before: today }, { after: maxDate }]}
          modifiersClassNames={{
            disabled: "opacity-40 cursor-not-allowed",
          }}
        />
      </div>

      {selected && (
        <p className="text-sm text-center text-text-secondary">
          {new Intl.DateTimeFormat(BCP47[locale], {
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
