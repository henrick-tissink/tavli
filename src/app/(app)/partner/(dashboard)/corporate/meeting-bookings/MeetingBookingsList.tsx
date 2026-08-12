"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Ban, Flag } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useT } from "@/lib/i18n/messages-provider";
import { transitionMeetingBookingAction } from "./actions";
import type { MeetingBookingStatus } from "@/lib/meeting-spaces/status";

export interface BookingListRow {
  id: string;
  spaceName: string;
  bookingDate: string;
  startTime: string; // "HH:MM:SS"
  endTime: string;
  partySize: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  company: string | null;
  notes: string | null;
  status: MeetingBookingStatus;
  totalCents: number;
}

const hhmm = (t: string) => t.slice(0, 5);

const STATUS_STYLE: Record<MeetingBookingStatus, string> = {
  requested: "bg-amber-50 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-stone-100 text-text-muted border-border",
  cancelled: "bg-stone-100 text-text-muted border-border",
  completed: "bg-surface-bg text-text-secondary border-border",
};

type Transition = "confirmed" | "declined" | "cancelled" | "completed";

export function MeetingBookingsList({ rows }: { rows: BookingListRow[] }) {
  const t = useT("partner.corporate");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Which booking (and which transition) is in flight. One shared `pending`
  // boolean greyed out every row's buttons; scoping it to the acting booking
  // keeps the rest of the list usable.
  const [acting, setActing] = useState<{ id: string; to: Transition } | null>(null);
  // `acting` outlives the transition by a render, so gate it on `pending`.
  const busy = pending ? acting : null;

  const act = (id: string, to: Transition, promptKey: string) => {
    if (!confirm(t(promptKey))) return;
    setError(null);
    setActing({ id, to });
    start(async () => {
      const res = await transitionMeetingBookingAction({ id, to });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <div className="bg-surface-white rounded-card border border-border p-6">
        <p className="font-semibold text-text-primary">{t("meetingBookings.emptyTitle")}</p>
        <p className="text-sm text-text-secondary mt-1">{t("meetingBookings.emptyBody")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p
          className="text-sm text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}
      {rows.map((b) => {
        const rowBusy = busy?.id === b.id;
        const actionBusy = (to: Transition) => rowBusy && busy?.to === to;
        return (
        <article key={b.id} className="bg-surface-white rounded-card border border-border p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold text-text-primary">
                {t("meetingBookings.card.when", {
                  date: b.bookingDate,
                  start: hhmm(b.startTime),
                  end: hhmm(b.endTime),
                })}
              </p>
              <p className="text-sm text-text-secondary mt-0.5">
                {t("meetingBookings.card.space", { name: b.spaceName })}
                {" · "}
                {t("meetingBookings.card.party", { count: b.partySize })}
                {" · "}
                {t("meetingBookings.card.total", { amount: String(b.totalCents / 100) })}
              </p>
              <p className="text-sm text-text-secondary mt-1">
                {t("meetingBookings.card.contact", { name: b.guestName, email: b.guestEmail })}
                {b.guestPhone ? ` · ${b.guestPhone}` : ""}
              </p>
              {b.company && (
                <p className="text-sm text-text-secondary mt-0.5">
                  {t("meetingBookings.card.company", { name: b.company })}
                </p>
              )}
              {b.notes && (
                <p className="text-sm text-text-secondary mt-2 leading-relaxed whitespace-pre-line">
                  <span className="font-medium">{t("meetingBookings.card.notes")}:</span> {b.notes}
                </p>
              )}
            </div>
            <span
              className={`flex-none rounded-pill border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[b.status]}`}
            >
              {t(`meetingBookings.status.${b.status}`)}
            </span>
          </div>

          {(b.status === "requested" || b.status === "confirmed") && (
            <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
              {b.status === "requested" && (
                <>
                  <button
                    type="button"
                    disabled={rowBusy}
                    aria-busy={actionBusy("confirmed") || undefined}
                    onClick={() => act(b.id, "confirmed", "meetingBookings.actions.confirmPrompt")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {actionBusy("confirmed") ? <Spinner size={14} /> : <Check size={14} />}{" "}
                    {actionBusy("confirmed")
                      ? t("meetingBookings.actions.pending")
                      : t("meetingBookings.actions.confirm")}
                  </button>
                  <button
                    type="button"
                    disabled={rowBusy}
                    aria-busy={actionBusy("declined") || undefined}
                    onClick={() => act(b.id, "declined", "meetingBookings.actions.declinePrompt")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text-secondary hover:bg-surface-bg disabled:opacity-50"
                  >
                    {actionBusy("declined") ? <Spinner size={14} /> : <X size={14} />}{" "}
                    {actionBusy("declined")
                      ? t("meetingBookings.actions.pending")
                      : t("meetingBookings.actions.decline")}
                  </button>
                </>
              )}
              {b.status === "confirmed" && (
                <>
                  <button
                    type="button"
                    disabled={rowBusy}
                    aria-busy={actionBusy("completed") || undefined}
                    onClick={() => act(b.id, "completed", "meetingBookings.actions.completePrompt")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {actionBusy("completed") ? <Spinner size={14} /> : <Flag size={14} />}{" "}
                    {actionBusy("completed")
                      ? t("meetingBookings.actions.pending")
                      : t("meetingBookings.actions.complete")}
                  </button>
                  <button
                    type="button"
                    disabled={rowBusy}
                    aria-busy={actionBusy("cancelled") || undefined}
                    onClick={() => act(b.id, "cancelled", "meetingBookings.actions.cancelPrompt")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text-secondary hover:bg-surface-bg disabled:opacity-50"
                  >
                    {actionBusy("cancelled") ? <Spinner size={14} /> : <Ban size={14} />}{" "}
                    {actionBusy("cancelled")
                      ? t("meetingBookings.actions.pending")
                      : t("meetingBookings.actions.cancel")}
                  </button>
                </>
              )}
            </div>
          )}
        </article>
        );
      })}
    </div>
  );
}
