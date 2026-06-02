"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import {
  addSlot,
  deleteSlot,
  seedDefaultAvailability,
} from "@/app/(app)/partner/(dashboard)/availability/actions";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun

export interface AvailabilitySlot {
  id: string;
  dayOfWeek: number;
  slotStart: string; // "HH:MM:SS"
  slotEnd: string;
  capacity: number;
}

export function AvailabilityEditor({
  slots,
}: {
  slots: AvailabilitySlot[];
}) {
  const t = useT("partner.settings");
  const dayLabels = t("availability.weekdaysFull").split(",");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const errText = (e?: string) =>
    e === "billing_locked" ? t("availability.errors.billing_locked") : (e ?? t("availability.genericFailed"));

  const byDay = new Map<number, AvailabilitySlot[]>();
  for (const s of slots) {
    if (!byDay.has(s.dayOfWeek)) byDay.set(s.dayOfWeek, []);
    byDay.get(s.dayOfWeek)!.push(s);
  }

  const totalSlots = slots.length;

  const handleDelete = (id: string) => {
    if (!confirm(t("availability.confirmDelete"))) return;
    start(async () => {
      const result = await deleteSlot(id);
      if (!result.ok) setError(errText(result.error));
      else router.refresh();
    });
  };

  const handleAdd = (dow: number, formData: FormData) => {
    const start_ = String(formData.get("start") ?? "");
    const end = String(formData.get("end") ?? "");
    const cap = parseInt(String(formData.get("capacity") ?? "0"), 10);
    setError(null);
    start(async () => {
      const result = await addSlot(dow, start_ + ":00", end + ":00", cap);
      if (!result.ok) setError(errText(result.error));
      else router.refresh();
    });
  };

  const handleQuickSeed = () => {
    const capStr = prompt(t("availability.seedPrompt"), "30");
    if (!capStr) return;
    const cap = parseInt(capStr, 10);
    if (!Number.isFinite(cap) || cap < 1) return;
    start(async () => {
      const result = await seedDefaultAvailability(cap);
      if (!result.ok) setError(errText(result.error));
      else router.refresh();
    });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {totalSlots === 0 && (
        <div className="bg-surface-white rounded-card border border-border p-6">
          <p className="font-semibold text-text-primary">{t("availability.emptyTitle")}</p>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">
            {t("availability.emptyBody")}
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={handleQuickSeed} disabled={pending}>
              {t("availability.seedDefault")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      )}

      {DAY_ORDER.map((dow) => {
        const daySlots = (byDay.get(dow) ?? []).sort((a, b) =>
          a.slotStart.localeCompare(b.slotStart),
        );
        return (
          <div
            key={dow}
            className="bg-surface-white rounded-card border border-border overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-border bg-surface-bg/40">
              <h3 className="font-display text-base font-bold">
                {dayLabels[dow]}
              </h3>
            </div>
            <div className="px-5 py-3 space-y-2">
              {daySlots.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 py-1.5 text-sm"
                >
                  <span className="font-mono text-text-primary">
                    {s.slotStart.slice(0, 5)} – {s.slotEnd.slice(0, 5)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-text-secondary">
                    <Users size={12} />
                    {t("availability.seats", { capacity: s.capacity })}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
                    disabled={pending}
                    aria-label={t("availability.deleteSlotAriaLabel")}
                    className="ml-auto p-1.5 rounded-lg text-text-muted hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              <form
                action={(fd) => handleAdd(dow, fd)}
                className="flex items-end gap-2 pt-2 border-t border-border"
              >
                <div className="space-y-1">
                  <label className="block text-xs text-text-muted" htmlFor={`start-${dow}`}>
                    {t("availability.startLabel")}
                  </label>
                  <input
                    id={`start-${dow}`}
                    name="start"
                    type="time"
                    required
                    defaultValue="18:00"
                    className="rounded-lg border border-border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-text-muted" htmlFor={`end-${dow}`}>
                    {t("availability.endLabel")}
                  </label>
                  <input
                    id={`end-${dow}`}
                    name="end"
                    type="time"
                    required
                    defaultValue="22:00"
                    className="rounded-lg border border-border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-text-muted" htmlFor={`cap-${dow}`}>
                    {t("availability.capacityLabel")}
                  </label>
                  <input
                    id={`cap-${dow}`}
                    name="capacity"
                    type="number"
                    min={1}
                    required
                    defaultValue={30}
                    className="w-20 rounded-lg border border-border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  />
                </div>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-primary-soft text-brand-primary-dark text-xs font-semibold hover:bg-brand-primary-soft/80"
                >
                  <Plus size={12} />
                  {t("availability.addSlot")}
                </button>
              </form>
            </div>
          </div>
        );
      })}
    </div>
  );
}
