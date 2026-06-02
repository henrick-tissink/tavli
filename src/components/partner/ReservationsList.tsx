"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { toast } from "@/components/toast";
import { CancelReservationSheet } from "@/components/partner/CancelReservationSheet";
import { useT } from "@/lib/i18n/messages-provider";
import { usePartnerDateLabels } from "@/lib/i18n/use-date-labels";
import {
  updateReservationStatus,
  type NewStatus,
} from "@/app/(app)/partner/(dashboard)/reservations/actions";

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

type Tab = "today" | "upcoming" | "past";

interface Props {
  today: ReservationRow[];
  upcoming: ReservationRow[];
  past: ReservationRow[];
}

export function ReservationsList({ today, upcoming, past }: Props) {
  const t = useT("partner.reservations");
  const { shortDate } = usePartnerDateLabels();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(
    today.length > 0 ? "today" : upcoming.length > 0 ? "upcoming" : "today",
  );
  const [pending, start] = useTransition();
  const [sheetReservation, setSheetReservation] = useState<ReservationRow | null>(
    null,
  );

  const handleStatusChange = (id: string, nextStatus: NewStatus) => {
    start(async () => {
      const result = await updateReservationStatus(id, nextStatus);
      if (!result.ok) {
        toast.error(result.error ?? t("toast.updateFailed"));
        return;
      }
      const label =
        nextStatus === "no_show"
          ? t("toast.noShow")
          : nextStatus === "seated"
            ? t("toast.seated")
            : t("toast.completed");
      toast.success(label);
      router.refresh();
    });
  };

  const rows = { today, upcoming, past }[tab];
  const counts = { today: today.length, upcoming: upcoming.length, past: past.length };

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-2 border-b border-border">
        {(["today", "upcoming", "past"] as Tab[]).map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === tabKey
                ? "border-brand-primary text-brand-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t(`tabs.${tabKey}`)} <span className="text-xs opacity-60">({counts[tabKey]})</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="bg-surface-white rounded-card border border-border p-10 text-center">
          <CalendarCheck size={28} className="mx-auto text-text-muted mb-3" />
          <p className="font-semibold text-text-primary">
            {tab === "today"
              ? t("empty.today")
              : tab === "upcoming"
                ? t("empty.upcoming")
                : t("empty.past")}
          </p>
          <p className="text-sm text-text-secondary mt-2 max-w-sm mx-auto">
            {tab === "past" ? t("empty.pastHint") : t("empty.defaultHint")}
          </p>
        </div>
      ) : (
        <div className="bg-surface-white rounded-card border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-surface-bg">
              <tr className="text-left">
                <th className="px-4 py-3 font-semibold text-text-secondary">{t("table.when")}</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">{t("table.client")}</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">{t("table.party")}</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">{t("table.zone")}</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">{t("table.status")}</th>
                <th className="px-4 py-3 font-semibold text-text-secondary text-right">
                  {t("table.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const dateLabel = shortDate(r.reservationDate);
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
                        {t(`status.${r.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.status === "confirmed" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(r.id, "seated")}
                            disabled={pending}
                            className="text-brand-primary text-xs font-semibold hover:underline mr-3"
                          >
                            {t("actions.seat")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(r.id, "no_show")}
                            disabled={pending}
                            className="text-amber-700 text-xs font-semibold hover:underline mr-3"
                          >
                            {t("actions.noShow")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSheetReservation(r)}
                            disabled={pending}
                            className="text-error text-xs font-semibold hover:underline"
                          >
                            {t("actions.cancel")}
                          </button>
                        </>
                      ) : r.status === "seated" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(r.id, "completed")}
                            disabled={pending}
                            className="text-brand-primary text-xs font-semibold hover:underline mr-3"
                          >
                            {t("actions.complete")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(r.id, "no_show")}
                            disabled={pending}
                            className="text-amber-700 text-xs font-semibold hover:underline"
                          >
                            {t("actions.noShow")}
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

      {sheetReservation && (
        <CancelReservationSheet
          open={true}
          onClose={() => setSheetReservation(null)}
          reservation={{
            id: sheetReservation.id,
            guestName: sheetReservation.guestName,
            reservationDate: sheetReservation.reservationDate,
            reservationTime: sheetReservation.reservationTime.slice(0, 5),
            partySize: sheetReservation.partySize,
          }}
        />
      )}
    </div>
  );
}
