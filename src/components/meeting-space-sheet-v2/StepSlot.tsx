"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/messages-provider";
import { Button } from "@/components/button";
import {
  computeStartSlots,
  computeTotalCents,
  durationOptions,
  minuteToTime,
  timeToMinute,
  type BusyInterval,
} from "@/lib/meeting-spaces/slots";
import { getMeetingSpaceBusyIntervals } from "@/app/api/meeting-bookings/actions";
import type { MeetingSpaceTile } from "./types";

interface Props {
  restaurantId: string;
  space: MeetingSpaceTile;
  bookingDate: string;
  durationMinutes: number | null;
  startMinute: number | null;
  onChange: (patch: { durationMinutes?: number; startMinute?: number | null }) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepSlot({
  restaurantId,
  space,
  bookingDate,
  durationMinutes,
  startMinute,
  onChange,
  onBack,
  onNext,
}: Props) {
  const t = useT("meetingSpaces");
  type BusyEntry = BusyInterval & { meetingSpaceId: string };
  type BusyState = { loading: true } | { loading: false; data: BusyEntry[] };
  const [busyState, setBusyState] = useState<BusyState>({ loading: true });

  useEffect(() => {
    let alive = true;
    getMeetingSpaceBusyIntervals({ restaurantId, date: bookingDate }).then((res) => {
      if (!alive) return;
      setBusyState({ loading: false, data: res.ok ? res.busy : [] });
    });
    return () => {
      alive = false;
    };
  }, [restaurantId, bookingDate]);

  const openMinute = timeToMinute(space.openTime);
  const closeMinute = timeToMinute(space.closeTime);
  const durations = durationOptions({
    openMinute,
    closeMinute,
    minBookingMinutes: space.minBookingMinutes,
  });
  const duration = durationMinutes ?? durations[0] ?? space.minBookingMinutes;

  const busy = busyState.loading
    ? []
    : busyState.data.filter((b) => b.meetingSpaceId === space.id);
  const slots = busyState.loading
    ? null
    : computeStartSlots({ openMinute, closeMinute, durationMinutes: duration, busy });

  const total = computeTotalCents(duration, space.hourlyRateCents);

  return (
    <div>
      <h3 className="font-display text-xl font-bold text-text-primary">
        {t("stepSlot.title")}
      </h3>

      <label className="mt-4 block max-w-xs">
        <span className="text-sm font-medium text-text-primary">{t("stepSlot.durationLabel")}</span>
        <select
          value={duration}
          onChange={(e) =>
            onChange({ durationMinutes: parseInt(e.target.value, 10), startMinute: null })
          }
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
        >
          {durations.map((d) => (
            <option key={d} value={d}>
              {t("stepSlot.durationOptionMinutes", { minutes: d })}
            </option>
          ))}
        </select>
      </label>

      {slots === null ? (
        <p className="mt-4 text-sm text-text-secondary">{t("stepSlot.loading")}</p>
      ) : slots.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">{t("stepSlot.noSlots")}</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {slots.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ startMinute: s })}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                startMinute === s
                  ? "border-brand-primary bg-brand-primary text-white"
                  : "border-border bg-surface-white text-text-secondary hover:bg-surface-bg"
              }`}
            >
              {minuteToTime(s)}
            </button>
          ))}
        </div>
      )}

      <p className="mt-4 text-sm font-semibold text-text-primary">
        {space.hourlyRateCents === 0
          ? t("stepSlot.totalFree")
          : t("stepSlot.totalLabel", { amount: String(total / 100) })}
      </p>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          {t("sheet.back")}
        </Button>
        <Button
          onClick={() => {
            if (durationMinutes === null) onChange({ durationMinutes: duration });
            onNext();
          }}
          disabled={startMinute === null}
        >
          {t("sheet.next")}
        </Button>
      </div>
    </div>
  );
}
