"use client";

import { motion } from "framer-motion";
import { MailCheck } from "lucide-react";

interface Props {
  email: string;
}

/**
 * Final step — confirmation screen shown after the server action resolves.
 * The badge animates in with a spring so the moment feels celebratory
 * without being childish.
 */
export function StepSent({ email }: Props) {
  return (
    <div className="text-center py-6 space-y-4">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 12 }}
        className="mx-auto w-16 h-16 rounded-full bg-[color:var(--color-occasion-product-soft)] flex items-center justify-center"
      >
        <MailCheck className="w-8 h-8 text-[color:var(--color-occasion-product)]" />
      </motion.div>
      <h2 className="font-display text-2xl font-bold text-text-primary">
        Verifică emailul
      </h2>
      <p className="text-sm text-text-secondary max-w-sm mx-auto">
        Ți-am trimis un link la{" "}
        <strong className="text-text-primary">{email}</strong>. Click pe el ca să
        confirmi cererea — restaurantul o primește în inbox imediat după.
      </p>
      <p className="text-xs text-text-muted">
        Nu primești emailul? Verifică Spam-ul sau reîncearcă peste 2 minute.
      </p>
    </div>
  );
}
