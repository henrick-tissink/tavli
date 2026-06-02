"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { RO_DATE_FORMAT, localDateFromIso } from "./helpers";
import { useT } from "@/lib/i18n/messages-provider";

interface StepSentProps {
  restaurantName: string;
  date: string; // ISO
  slot: string;
  guests: number;
  confirmationToken?: string | null;
  onClose: () => void;
}

export function StepSent({
  restaurantName,
  date,
  slot,
  guests,
  confirmationToken,
  onClose,
}: StepSentProps) {
  const t = useT("booking");
  const formatted = RO_DATE_FORMAT.format(localDateFromIso(date));

  return (
    <div className="text-center py-6 space-y-4">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="mx-auto w-16 h-16 flex items-center justify-center"
      >
        <CheckCircle className="w-16 h-16 text-brand-primary" />
      </motion.div>

      <h2 className="font-display text-2xl font-bold text-text-primary text-center">
        {t("sheet.stepSent.title")}
      </h2>

      <p className="text-sm text-text-secondary text-center">
        {restaurantName} · {formatted} {t("sheet.stepSent.atTime")} {slot} · {t("sheet.stepSent.subtitle", { guests })}
      </p>

      <div className="flex flex-col gap-2 pt-2">
        {confirmationToken ? (
          <Link
            href={`/reservations/${confirmationToken}`}
            className="w-full bg-brand-primary text-white font-semibold py-3 rounded-button hover:bg-brand-primary-dark transition-colors text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          >
            {t("sheet.stepSent.viewReservation")}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className={`w-full font-semibold py-3 rounded-button transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
            confirmationToken
              ? "border border-border text-text-primary hover:bg-surface-bg"
              : "bg-brand-primary text-white hover:bg-brand-primary-dark"
          }`}
        >
          {t("sheet.stepSent.backToRestaurant")}
        </button>
      </div>
    </div>
  );
}
