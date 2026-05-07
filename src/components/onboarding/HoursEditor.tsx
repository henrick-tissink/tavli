"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import type { DayHours } from "@/lib/onboarding";

const DAY_LABELS = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

export function HoursEditor({
  value,
  onChange,
  name = "hours",
}: {
  value: DayHours[];
  onChange?: (v: DayHours[]) => void;
  name?: string;
}) {
  const [hours, setHours] = useState<DayHours[]>(value);

  function update(dayOfWeek: number, patch: Partial<DayHours>) {
    const next = hours.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h));
    setHours(next);
    onChange?.(next);
  }

  function copyFirstOpenToAll() {
    const firstOpen = hours.find((h) => h.isOpen);
    if (!firstOpen) return;
    const next = hours.map((h) => ({
      ...h,
      isOpen: true,
      openAt: firstOpen.openAt,
      closeAt: firstOpen.closeAt,
    }));
    setHours(next);
    onChange?.(next);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(hours)} />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={copyFirstOpenToAll}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:underline"
        >
          <Copy size={12} />
          Copiază prima zi deschisă la toate
        </button>
      </div>

      <div className="space-y-2">
        {DAY_ORDER.map((dow) => {
          const row = hours.find((h) => h.dayOfWeek === dow);
          if (!row) return null;
          return (
            <div
              key={dow}
              className="flex items-center gap-3 rounded-lg border border-border p-3 bg-surface-white"
            >
              <div className="w-24 flex-shrink-0">
                <p className="text-sm font-medium text-text-primary">
                  {DAY_LABELS[dow]}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={row.isOpen}
                  onChange={(e) => update(dow, { isOpen: e.target.checked })}
                  className="h-4 w-4 rounded border-border accent-[var(--color-brand-primary)]"
                />
                Deschis
              </label>
              <div
                className={`flex items-center gap-2 flex-1 justify-end transition-opacity ${
                  row.isOpen ? "opacity-100" : "opacity-40 pointer-events-none"
                }`}
              >
                <input
                  type="time"
                  value={row.openAt}
                  onChange={(e) => update(dow, { openAt: e.target.value })}
                  className="rounded-lg border border-border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
                <span className="text-text-muted">→</span>
                <input
                  type="time"
                  value={row.closeAt}
                  onChange={(e) => update(dow, { closeAt: e.target.value })}
                  className="rounded-lg border border-border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
