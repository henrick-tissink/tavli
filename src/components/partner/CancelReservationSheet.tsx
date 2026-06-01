"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/bottom-sheet";
import { toast } from "@/components/toast";
import { CANCEL_REASONS, type CancelReasonKey } from "@/lib/cancel-reasons";
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

const WEEKDAYS_SHORT = ["Dum", "Lun", "Mar", "Mie", "Joi", "Vin", "Sâm"];
const MONTHS_SHORT = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "noi", "dec"];

function prettyDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function CancelReservationSheet({ open, onClose, reservation }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<CancelReasonKey | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    if (!selected) return;
    start(async () => {
      const result = await cancelReservation(reservation.id, selected);
      if (!result.ok) {
        toast.error(result.error ?? "Rezervarea nu a putut fi anulată.");
        return;
      }
      if (result.emailSent === false) {
        toast.success("Anulată — emailul către client nu a putut fi trimis.");
      } else {
        toast.success("Rezervarea a fost anulată.");
      }
      setSelected(null);
      onClose();
      router.refresh();
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Anulează rezervarea">
      <div className="space-y-4">
        <div className="rounded-card bg-surface-bg px-4 py-3">
          <p className="text-sm font-semibold text-text-primary">
            {reservation.guestName}
          </p>
          <p className="text-xs text-text-secondary mt-0.5">
            {prettyDate(reservation.reservationDate)} · {reservation.reservationTime} · grup de{" "}
            {reservation.partySize}
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-text-primary mb-2">
            De ce anulezi?
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
                  {CANCEL_REASONS[key].partnerLabel}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-text-muted mt-2">
            Clientul va vedea o variantă prietenoasă a acestui motiv în emailul primit.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 rounded-button text-sm font-semibold text-text-secondary hover:text-text-primary"
          >
            Păstrează rezervarea
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!selected || pending}
            className="px-4 py-2 rounded-button text-sm font-semibold text-white bg-error disabled:opacity-50"
          >
            {pending ? "Se anulează…" : "Anulează rezervarea"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
