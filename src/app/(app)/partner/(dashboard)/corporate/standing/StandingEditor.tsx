"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, CalendarClock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/button";
import { useT } from "@/lib/i18n/messages-provider";
import { interpolate } from "@/lib/i18n/t";
import { createStandingAction, cancelStandingAction } from "./actions";

export interface StandingListItem {
  id: string;
  dayOfWeek: number;
  startTime: string;
  partySize: number;
  intervalWeeks: number;
  tableId: string;
  tableLabel: string | null;
  guestName: string;
  startDate: string;
  endDate: string | null;
  status: "active" | "cancelled";
  nextOccurrence: string | null;
  conflictCount: number;
}

interface FormState {
  dayOfWeek: string; startTime: string; partySize: string; intervalWeeks: string;
  tableId: string; startDate: string; endDate: string;
  guestName: string; guestPhone: string; guestEmail: string; notes: string;
}

const EMPTY: FormState = {
  dayOfWeek: "2", startTime: "19:00", partySize: "2", intervalWeeks: "1",
  tableId: "", startDate: "", endDate: "", guestName: "", guestPhone: "", guestEmail: "", notes: "",
};

const inputCls =
  "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary";

export function StandingEditor({
  restaurantId, initialSeries, tables, weekdays,
}: {
  restaurantId: string;
  initialSeries: StandingListItem[];
  tables: { id: string; label: string }[];
  weekdays: string[];
}) {
  const t = useT("partner.corporate");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>({ ...EMPTY, tableId: tables[0]?.id ?? "" });

  const intervalLabel = (w: number) => (w === 2 ? t("standingMgmt.intervalFortnightly") : t("standingMgmt.intervalWeekly"));

  const submit = () => {
    setError(null);
    if (!form.guestName.trim()) { setError(t("standingMgmt.nameRequired")); return; }
    start(async () => {
      const res = await createStandingAction({
        restaurantId,
        dayOfWeek: parseInt(form.dayOfWeek, 10),
        startTime: form.startTime,
        partySize: parseInt(form.partySize, 10),
        intervalWeeks: (parseInt(form.intervalWeeks, 10) === 2 ? 2 : 1),
        tableId: form.tableId,
        guestName: form.guestName.trim(),
        guestPhone: form.guestPhone.trim(),
        guestEmail: form.guestEmail.trim() || null,
        notes: form.notes.trim() || null,
        startDate: form.startDate,
        endDate: form.endDate || null,
      });
      if (!res.ok) { setError(res.error); return; }
      setCreating(false);
      setForm({ ...EMPTY, tableId: tables[0]?.id ?? "" });
      router.refresh();
    });
  };

  const cancelSeries = (id: string) => {
    if (!confirm(t("standingMgmt.cancelConfirm"))) return;
    setError(null);
    start(async () => {
      const res = await cancelStandingAction({ id, restaurantId });
      if (!res.ok) { setError(res.error); return; }
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {error && (
        <p className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">{error}</p>
      )}

      {initialSeries.length === 0 && !creating && (
        <div className="bg-surface-white rounded-card border border-border p-6">
          <p className="font-semibold text-text-primary">{t("standingMgmt.emptyTitle")}</p>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">{t("standingMgmt.emptyBody")}</p>
          <div className="mt-4">
            <Button variant="primary" onClick={() => setCreating(true)} disabled={pending}>
              <span className="inline-flex items-center gap-2"><Plus size={16} />{t("standingMgmt.addFirst")}</span>
            </Button>
          </div>
        </div>
      )}

      {initialSeries.map((s) => (
        <article key={s.id} className="bg-surface-white rounded-card border border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-lg font-bold text-text-primary truncate">{s.guestName}</h3>
              <p className="text-sm text-text-secondary mt-1">
                {interpolate(t("standingMgmt.ruleSummary"), {
                  interval: intervalLabel(s.intervalWeeks),
                  weekday: weekdays[s.dayOfWeek] ?? "",
                  time: s.startTime.slice(0, 5),
                  count: s.partySize,
                  table: s.tableLabel ?? s.tableId.slice(0, 4),
                })}
              </p>
              <p className="text-xs text-text-muted mt-1 inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock size={13} />
                  {s.nextOccurrence ? interpolate(t("standingMgmt.nextOccurrence"), { date: s.nextOccurrence }) : t("standingMgmt.noUpcoming")}
                </span>
                {s.conflictCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <AlertTriangle size={13} />
                    {interpolate(t("standingMgmt.conflicts"), { count: s.conflictCount })}
                  </span>
                )}
                <span className={s.status === "active" ? "text-emerald-700" : "text-text-muted"}>
                  {s.status === "active" ? t("standingMgmt.statusActive") : t("standingMgmt.statusCancelled")}
                </span>
              </p>
            </div>
            {s.status === "active" && (
              <button type="button" onClick={() => cancelSeries(s.id)} disabled={pending}
                aria-label={t("standingMgmt.cancelSeries")}
                className="p-2 rounded-lg text-text-secondary hover:bg-red-50 hover:text-error disabled:opacity-50 shrink-0">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </article>
      ))}

      {creating ? (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="bg-surface-white rounded-card border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-text-primary">{t("standingMgmt.newTitle")}</h3>
            <button type="button" onClick={() => setCreating(false)} className="p-1.5 rounded-lg text-text-secondary hover:bg-surface-bg"><X size={16} /></button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.weekdayLabel")}</span>
              <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })} className={inputCls}>
                {weekdays.map((w, i) => <option key={i} value={i}>{w}</option>)}
              </select>
            </label>
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.timeLabel")}</span>
              <input type="time" step={1800} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required className={inputCls} />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.partyLabel")}</span>
              <input type="number" min={1} max={50} value={form.partySize} onChange={(e) => setForm({ ...form, partySize: e.target.value })} required className={inputCls} />
            </label>
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.intervalLabel")}</span>
              <select value={form.intervalWeeks} onChange={(e) => setForm({ ...form, intervalWeeks: e.target.value })} className={inputCls}>
                <option value="1">{t("standingMgmt.intervalWeekly")}</option>
                <option value="2">{t("standingMgmt.intervalFortnightly")}</option>
              </select>
            </label>
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.tableLabel")}</span>
              <select value={form.tableId} onChange={(e) => setForm({ ...form, tableId: e.target.value })} required className={inputCls}>
                {tables.map((tb) => <option key={tb.id} value={tb.id}>{tb.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.startDateLabel")}</span>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required className={inputCls} />
            </label>
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.endDateLabel")} <span className="text-text-muted">{t("standingMgmt.endDateOptional")}</span></span>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={inputCls} />
            </label>
          </div>

          <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.guestNameLabel")}</span>
            <input type="text" maxLength={160} value={form.guestName} onChange={(e) => setForm({ ...form, guestName: e.target.value })} required className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.guestPhoneLabel")}</span>
              <input type="tel" value={form.guestPhone} onChange={(e) => setForm({ ...form, guestPhone: e.target.value })} required className={inputCls} />
            </label>
            <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.guestEmailLabel")}</span>
              <input type="email" value={form.guestEmail} onChange={(e) => setForm({ ...form, guestEmail: e.target.value })} className={inputCls} />
            </label>
          </div>
          <label className="block"><span className="text-sm font-medium text-text-primary">{t("standingMgmt.notesLabel")}</span>
            <textarea rows={2} maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inputCls} resize-y`} />
          </label>

          <div className="flex items-center gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)} disabled={pending}>{t("standingMgmt.cancel")}</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? t("standingMgmt.saving") : t("standingMgmt.save")}</Button>
          </div>
        </form>
      ) : initialSeries.length > 0 && (
        <div>
          <Button variant="secondary" onClick={() => setCreating(true)} disabled={pending}>
            <span className="inline-flex items-center gap-2"><Plus size={16} />{t("standingMgmt.addSeries")}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
