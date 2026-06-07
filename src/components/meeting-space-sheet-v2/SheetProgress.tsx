"use client";

import { useT } from "@/lib/i18n/messages-provider";

interface Props {
  current: number;
  total: number;
}

export function SheetProgress({ current, total }: Props) {
  const t = useT("meetingSpaces");
  const label = t("sheet.progress.stepLabel")
    .replace("{current}", String(current))
    .replace("{total}", String(total));
  return (
    <div
      className="flex items-center gap-2 mt-1"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
    >
      <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
        {label}
      </span>
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full transition-all ${
              i + 1 <= current ? "w-6 bg-brand-primary" : "w-3 bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
