"use client";

import { motion } from "framer-motion";
import { MailCheck } from "lucide-react";
import { useT } from "@/lib/i18n/messages-provider";

interface Props {
  email: string;
}

/**
 * Final step — confirmation screen shown after the server action resolves.
 * The badge animates in with a spring so the moment feels celebratory
 * without being childish.
 */
export function StepSent({ email }: Props) {
  const t = useT("events");
  // Split on the {email} placeholder to wrap the address in <strong>.
  const bodyTemplate = t("sheetV2.stepSent.body");
  const [before, after] = bodyTemplate.split("{email}");
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
        {t("sheetV2.stepSent.heading")}
      </h2>
      <p className="text-sm text-text-secondary max-w-sm mx-auto">
        {before}
        <strong className="text-text-primary">{email}</strong>
        {after}
      </p>
      <p className="text-xs text-text-muted">
        {t("sheetV2.stepSent.spamNotice")}
      </p>
    </div>
  );
}
