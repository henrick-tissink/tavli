"use client";

import { DayPicker } from "react-day-picker";
import { ro } from "date-fns/locale";
import { addDays, format } from "date-fns";
import "react-day-picker/style.css";
import { useT } from "@/lib/i18n/messages-provider";

interface Props {
  minLeadDays: number;
  value: string;
  timePreference: string;
  onChange: (patch: { eventDate?: string; eventTimePreference?: string }) => void;
  onBack: () => void;
  onNext: () => void;
}

/**
 * Step 2 — date picker. Uses react-day-picker with RO locale and a lead-time
 * notice that visualises the earliest date the venue accepts. Time preference
 * is free-text and optional.
 */
export function StepDate({
  minLeadDays,
  value,
  timePreference,
  onChange,
  onBack,
  onNext,
}: Props) {
  const t = useT("events");
  const today = new Date();
  const minDate = addDays(today, minLeadDays);
  const selected = value ? new Date(value) : undefined;
  const leadTimeTemplate = t("sheetV2.stepDate.leadTimeNotice");
  const [leadBefore, leadAfter] = leadTimeTemplate.split("{minLeadDays}");
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-text-primary">
        {t("sheetV2.stepDate.heading")}
      </h2>
      <div className="rounded-card border border-border p-3 bg-[color:var(--color-occasion-corporate-soft)]">
        <p className="text-xs font-medium text-text-secondary">
          {leadBefore}
          <span className="font-semibold">{minLeadDays}</span>
          {leadAfter}
        </p>
      </div>
      <div className="flex justify-center">
        <DayPicker
          mode="single"
          locale={ro}
          weekStartsOn={1}
          selected={selected}
          onSelect={(d) => d && onChange({ eventDate: format(d, "yyyy-MM-dd") })}
          disabled={{ before: minDate }}
        />
      </div>
      {selected && (
        <p className="text-sm text-center text-text-primary">
          {format(selected, "EEEE, d MMMM yyyy", { locale: ro })}
        </p>
      )}
      <label className="block">
        <span className="text-sm font-medium text-text-primary">
          {t("sheetV2.stepDate.timePrefLabel")}
        </span>
        <input
          type="text"
          value={timePreference}
          placeholder={t("sheetV2.stepDate.timePrefPlaceholder")}
          onChange={(e) => onChange({ eventTimePreference: e.target.value })}
          className="w-full mt-1 border border-border rounded-card p-2 focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 border border-border rounded-card py-3 font-semibold text-text-primary hover:bg-surface-bg transition-colors"
        >
          {t("sheetV2.stepDate.back")}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!value}
          className="flex-1 bg-brand-primary text-surface-white rounded-card py-3 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-primary-dark transition-colors"
        >
          {t("sheetV2.stepDate.continue")}
        </button>
      </div>
    </div>
  );
}
