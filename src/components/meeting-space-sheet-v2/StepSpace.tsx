"use client";

import { Users, Clock } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";
import { Button } from "@/components/button";
import type { MeetingSpaceTile } from "./types";

const hhmm = (t: string) => t.slice(0, 5);

interface Props {
  spaces: MeetingSpaceTile[];
  selectedId: string | null;
  onPick: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function StepSpace({ spaces, selectedId, onPick, onBack, onNext }: Props) {
  const t = useT("meetingSpaces");
  return (
    <div>
      <h3 className="font-display text-xl font-bold text-text-primary">
        {t("stepSpace.title")}
      </h3>
      {spaces.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">{t("stepSpace.empty")}</p>
      ) : (
        <div className="mt-4 grid gap-3 desktop:grid-cols-2">
          {spaces.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.id)}
              className={`rounded-card border p-4 text-left transition-colors ${
                selectedId === s.id
                  ? "border-brand-primary ring-2 ring-brand-primary/30"
                  : "border-border hover:bg-surface-bg"
              }`}
            >
              <span className="block font-semibold text-text-primary">{s.name}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                <span className="inline-flex items-center gap-1">
                  <Users size={14} />
                  {t("stepSpace.seats", { count: s.capacity })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={14} />
                  {t("stepSpace.hours", { open: hhmm(s.openTime), close: hhmm(s.closeTime) })}
                </span>
                <span className="font-semibold text-text-primary">
                  {s.hourlyRateCents === 0
                    ? t("stepSpace.rateFree")
                    : t("stepSpace.ratePerHour", { amount: String(s.hourlyRateCents / 100) })}
                </span>
              </span>
              {s.description && (
                <span className="mt-1 block text-sm text-text-secondary">{s.description}</span>
              )}
              {s.amenities.length > 0 && (
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {s.amenities.map((a) => (
                    <span
                      key={a}
                      className="rounded-pill bg-surface-bg px-2 py-0.5 text-xs font-medium text-text-secondary"
                    >
                      {a}
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          {t("sheet.back")}
        </Button>
        <Button onClick={onNext} disabled={!selectedId}>
          {t("sheet.next")}
        </Button>
      </div>
    </div>
  );
}
