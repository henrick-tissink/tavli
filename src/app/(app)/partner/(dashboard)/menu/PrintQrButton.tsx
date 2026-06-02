"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/messages-provider";

interface Props {
  menuItemCount: number;
}

export function PrintQrButton({ menuItemCount }: Props) {
  const t = useT("partner.menu");
  const enabled = menuItemCount >= 1;
  const baseClasses =
    "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors";

  if (!enabled) {
    return (
      <span
        data-testid="print-qr-button"
        data-disabled="true"
        title={t("printQr.disabledTitle")}
        aria-disabled="true"
        className={`${baseClasses} border-border text-text-muted bg-surface-bg cursor-not-allowed`}
      >
        {t("printQr.label")}
      </span>
    );
  }

  return (
    <Link
      href="/partner/menu/qr"
      data-testid="print-qr-button"
      data-disabled="false"
      className={`${baseClasses} border-brand-primary text-brand-primary bg-surface-white hover:bg-brand-primary-soft`}
    >
      {t("printQr.label")}
    </Link>
  );
}
