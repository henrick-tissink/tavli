"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/bottom-sheet";
import { toast } from "@/components/toast";
import { CANCEL_REASONS, type CancelReasonKey } from "@/lib/cancel-reasons";
import { useT } from "@/lib/i18n/messages-provider";
import { usePartnerDateLabels } from "@/lib/i18n/use-date-labels";
import { cancelReservation } from "@/app/(app)/partner/(dashboard)/reservations/actions";

interface ReservationSummary {
  id: string;
  guestName: string;
  reservationDate: string; // YYYY-MM-DD
  reservationTime: string; // HH:MM
  partySize: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  reservation: ReservationSummary;
}

export function CancelReservationSheet({ open, onClose, reservation }: Props) {
  const t = useT("partner.reservations");
  const { shortDate } = usePartnerDateLabels();
  const router = useRouter();
  const [selected, setSelected] = useState<CancelReasonKey | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    if (!selected) return;
    start(async () => {
      const result = await cancelReservation(reservation.id, selected);
      if (!result.ok) {
        toast.error(result.error ?? t("cancel.cancelFailed"));
        return;
      }
      if (result.emailSent === false) {
        toast.success(t("cancel.toastCancelledNoEmail"));
      } else {
        toast.success(t("cancel.toastCancelled"));
      }
      setSelected(null);
      onClose();
      router.refresh();
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t("cancel.title")}>
      <div className="space-y-4">
        <div className="rounded-card bg-surface-bg px-4 py-3">
          <p className="text-sm font-semibold text-text-primary">
            {reservation.guestName}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            {shortDate(reservation.reservationDate)} · {reservation.reservationTime} ·{" "}
            {t("cancel.summaryParty", { count: reservation.partySize })}
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-text-primary mb-2">
            {t("cancel.reasonsTitle")}
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CANCEL_REASONS) as CancelReasonKey[]).map((key) => {
              const isSelected = selected === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  className={[
                    "px-3 py-1.5 rounded-pill text-sm font-medium border transition-colors",
                    isSelected
                      ? "bg-brand-primary border-brand-primary text-white"
                      : "bg-surface-white border-border text-text-secondary hover:border-brand-primary hover:text-text-primary",
                  ].join(" ")}
                  aria-pressed={isSelected}
                >
                  {t(`cancel.reasons.${key}`)}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-text-muted mt-2">
            {t("cancel.reasonsHint")}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 rounded-button text-sm font-semibold text-text-secondary hover:text-text-primary"
          >
            {t("cancel.keep")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!selected || pending}
            className="px-4 py-2 rounded-button text-sm font-semibold text-white bg-error disabled:opacity-50"
          >
            {pending ? t("cancel.submitPending") : t("cancel.submit")}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
