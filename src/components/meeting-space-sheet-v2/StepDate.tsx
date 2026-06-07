"use client";

import { useT } from "@/lib/i18n/messages-provider";
import { Button } from "@/components/button";
import { isoDate, addDays } from "@/components/reservation-sheet-v2/helpers";

interface Props {
  value: string;
  onChange: (patch: { bookingDate: string }) => void;
  onNext: () => void;
}

export function StepDate({ value, onChange, onNext }: Props) {
  const t = useT("meetingSpaces");
  const today = isoDate(new Date());
  const tomorrow = isoDate(addDays(new Date(), 1));
  const chip = (label: string, date: string) => (
    <button
      type="button"
      onClick={() => onChange({ bookingDate: date })}
      className={`rounded-pill border px-3 py-1.5 text-sm font-semibold ${
        value === date
          ? "border-brand-primary bg-brand-primary text-white"
          : "border-border bg-surface-white text-text-secondary hover:bg-surface-bg"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div>
      <h3 className="font-display text-xl font-bold text-text-primary">
        {t("stepDate.title")}
      </h3>
      <div className="mt-4 flex gap-2">
        {chip(t("stepDate.today"), today)}
        {chip(t("stepDate.tomorrow"), tomorrow)}
      </div>
      <label className="mt-4 block max-w-xs">
        <span className="text-sm font-medium text-text-primary">{t("stepDate.dateLabel")}</span>
        <input
          type="date"
          min={today}
          value={value}
          onChange={(e) => onChange({ bookingDate: e.target.value })}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
        />
      </label>
      <div className="mt-6 flex justify-end">
        <Button onClick={onNext} disabled={!value || value < today}>
          {t("sheet.next")}
        </Button>
      </div>
    </div>
  );
}
