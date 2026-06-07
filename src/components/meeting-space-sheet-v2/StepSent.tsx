"use client";

import { CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";
import { minuteToTime } from "@/lib/meeting-spaces/slots";

interface Props {
  restaurantName: string;
  bookingDate: string;
  startMinute: number;
  durationMinutes: number;
}

export function StepSent({ restaurantName, bookingDate, startMinute, durationMinutes }: Props) {
  const t = useT("meetingSpaces");
  return (
    <div className="py-8 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-brand-primary" aria-hidden />
      <h3 className="mt-4 font-display text-xl font-bold text-text-primary">
        {t("stepSent.title")}
      </h3>
      <p className="mt-2 text-sm text-text-secondary">
        {t("stepSent.body", { restaurantName })}
      </p>
      <p className="mt-3 text-sm font-semibold text-text-primary">
        {t("stepSent.summary", {
          date: bookingDate,
          start: minuteToTime(startMinute),
          end: minuteToTime(startMinute + durationMinutes),
        })}
      </p>
    </div>
  );
}
