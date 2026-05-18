"use client";

import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { RO_DATE_FORMAT, localDateFromIso } from "./helpers";

interface StepSentProps {
  restaurantName: string;
  date: string; // ISO
  slot: string;
  guests: number;
  onClose: () => void;
}

export function StepSent({
  restaurantName,
  date,
  slot,
  guests,
  onClose,
}: StepSentProps) {
  const formatted = RO_DATE_FORMAT.format(localDateFromIso(date));

  return (
    <div className="text-center py-6 space-y-4">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="mx-auto w-16 h-16 flex items-center justify-center"
      >
        <CheckCircle className="w-16 h-16 text-success" />
      </motion.div>

      <h2 className="font-display text-2xl font-bold text-text-primary text-center">
        Rezervarea ta este confirmată
      </h2>

      <p className="text-sm text-text-secondary text-center">
        {restaurantName} · {formatted} la {slot} · {guests} persoane
      </p>

      <button
        type="button"
        onClick={onClose}
        className="mt-2 w-full bg-brand-primary text-white font-semibold py-3 rounded-button hover:bg-brand-primary-dark transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
      >
        Înapoi la restaurant
      </button>
    </div>
  );
}
