"use client";

import { useState } from "react";
import { modifyReservationByTokenAction } from "@/app/(public)/[lang]/reservations/[token]/actions";
import { useT } from "@/lib/i18n/messages-provider";

interface Props {
  token: string;
  restaurantName: string;
  initial: { date: string; time: string; partySize: number; version: number };
}

/**
 * §02 §4.3 / WCAG 2.2 §3.3.7 — diner modify form, pre-filled with the current
 * booking so nothing must be re-entered. Submits the read version for the
 * optimistic-lock check.
 */
export function ModifyReservationForm({ token, restaurantName, initial }: Props) {
  const t = useT("booking");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [partySize, setPartySize] = useState(initial.partySize);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const r = await modifyReservationByTokenAction({ token, version: initial.version, date, time, partySize });
    setSubmitting(false);
    if (r.ok) setDone(true);
    else setError(r.error ?? t("modify.errorGeneric"));
  }

  if (done) {
    return (
      <div role="status" aria-live="polite" className="rounded-card bg-brand-primary-soft p-6 text-center">
        <p className="font-display text-xl font-bold text-brand-primary-dark">{t("modify.doneTitle")}</p>
        <p className="text-sm text-text-secondary mt-2">{t("modify.doneBody")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-text-secondary">
        {t("modify.modifyingLabel", { restaurantName })}
      </p>
      <label className="block">
        <span className="text-sm font-semibold text-text-primary">{t("modify.dateLabel")}</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
          className="mt-2 block w-full rounded-lg border border-border p-3 text-sm" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-text-primary">{t("modify.timeLabel")}</span>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required
          className="mt-2 block w-full rounded-lg border border-border p-3 text-sm" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-text-primary">{t("modify.partySizeLabel")}</span>
        <input type="number" min={1} max={50} value={partySize}
          onChange={(e) => setPartySize(Number(e.target.value))} required
          className="mt-2 block w-full rounded-lg border border-border p-3 text-sm" />
      </label>
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
      <button type="submit" disabled={submitting} aria-busy={submitting}
        className="w-full bg-brand-primary text-white font-semibold py-3 rounded-lg disabled:opacity-50">
        {submitting ? t("modify.submitPending") : t("modify.submitLabel")}
      </button>
    </form>
  );
}
