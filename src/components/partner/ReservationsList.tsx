"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateReservationStatus,
  type NewStatus,
} from "@/app/partner/(dashboard)/reservations/actions";

export interface ReservationRow {
  id: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string | null;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  zone: string | null;
  notes: string | null;
  status: "confirmed" | "cancelled" | "seated" | "completed" | "no_show";
  createdAt: string;
}

const STATUS_STYLE: Record<ReservationRow["status"], string> = {
  confirmed: "bg-emerald-50 text-emerald-800",
  seated: "bg-brand-primary-soft text-brand-primary-dark",
  completed: "bg-surface-bg text-text-muted",
  cancelled: "bg-red-50 text-red-800",
  no_show: "bg-amber-50 text-amber-800",
};

const STATUS_LABEL: Record<ReservationRow["status"], string> = {
  confirmed: "Confirmed",
  seated: "Seated",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

type Tab = "today" | "upcoming" | "past";

interface Props {
  today: ReservationRow[];
  upcoming: ReservationRow[];
  past: ReservationRow[];
}

export function ReservationsList({ today, upcoming, past }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(
    today.length > 0 ? "today" : upcoming.length > 0 ? "upcoming" : "today",
  );
  const [pending, start] = useTransition();
  const [noticeId, setNoticeId] = useState<{ id: string; text: string } | null>(null);

  const handleChange = (id: string, nextStatus: NewStatus) => {
    const verb =
      nextStatus === "cancelled"
        ? "cancel"
        : nextStatus === "no_show"
          ? "mark as no-show"
          : nextStatus === "seated"
            ? "mark seated"
            : "complete";
    if (nextStatus === "cancelled" && !confirm(`Cancel this reservation?`)) return;

    start(async () => {
      const result = await updateReservationStatus(id, nextStatus);
      if (!result.ok) {
        setNoticeId({ id, text: result.error ?? "Failed." });
      } else {
        router.refresh();
      }
    });
  };

  const rows = { today, upcoming, past }[tab];
  const counts = { today: today.length, upcoming: upcoming.length, past: past.length };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-2 border-b border-border">
        {(["today", "upcoming", "past"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t} <span className="text-xs opacity-60">({counts[t]})</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <p className="text-sm text-text-secondary">
            {tab === "today"
              ? "No bookings today."
              : tab === "upcoming"
                ? "No upcoming bookings."
                : "No past bookings yet."}
          </p>
        </div>
      ) : (
        <div className="bg-surface-white rounded-card border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-bg">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold text-text-secondary">When</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">Guest</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">Party</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">Zone</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">Status</th>
                <th className="px-4 py-3 font-semibold text-text-secondary text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const d = new Date(`${r.reservationDate}T12:00:00`);
                const dateLabel = d.toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                });
                const showActions =
                  r.status === "confirmed" || r.status === "seated";
                return (
                  <tr key={r.id} className="hover:bg-surface-bg/50 align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-text-primary">
                        {r.reservationTime.slice(0, 5)}
                      </p>
                      <p className="text-xs text-text-muted">{dateLabel}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-text-primary">
                        {r.guestName}
                      </p>
                      <p className="text-xs text-text-muted">{r.guestPhone}</p>
                      {r.guestEmail && (
                        <p className="text-xs text-text-muted truncate">
                          {r.guestEmail}
                        </p>
                      )}
                      {r.notes && (
                        <p className="text-xs italic text-text-secondary mt-0.5 max-w-xs">
                          “{r.notes}”
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-primary">{r.partySize}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {r.zone ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status]}`}
                      >
                        {STATUS_LABEL[r.status]}
                      </span>
                      {noticeId?.id === r.id && (
                        <p className="text-xs text-error mt-1">
                          {noticeId.text}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {showActions ? (
                        <>
                          {r.status === "confirmed" && (
                            <button
                              type="button"
                              onClick={() => handleChange(r.id, "seated")}
                              disabled={pending}
                              className="text-brand-primary text-xs font-semibold hover:underline mr-3"
                            >
                              Mark seated
                            </button>
                          )}
                          {r.status === "seated" && (
                            <button
                              type="button"
                              onClick={() => handleChange(r.id, "completed")}
                              disabled={pending}
                              className="text-brand-primary text-xs font-semibold hover:underline mr-3"
                            >
                              Complete
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleChange(r.id, "no_show")}
                            disabled={pending}
                            className="text-amber-700 text-xs font-semibold hover:underline mr-3"
                          >
                            No-show
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChange(r.id, "cancelled")}
                            disabled={pending}
                            className="text-error text-xs font-semibold hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
