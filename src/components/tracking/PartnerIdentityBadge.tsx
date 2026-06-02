"use client";

import Image from "next/image";
import { useT } from "@/lib/i18n/messages-provider";

export function PartnerIdentityBadge({
  name,
  heroPath,
  viewing,
}: {
  name: string;
  heroPath: string | null;
  viewing: boolean;
}) {
  const t = useT("events");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const url = heroPath
    ? `${base}/storage/v1/object/public/restaurant-photos/${heroPath}`
    : null;
  return (
    <div className="flex items-center gap-3 bg-surface-bg rounded-card p-3">
      <span className="relative w-12 h-12 rounded-full overflow-hidden bg-border">
        {url && (
          <Image src={url} alt="" fill className="object-cover" unoptimized />
        )}
        {viewing && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[color:var(--color-occasion-product)] rounded-full ring-2 ring-surface-bg animate-pulse"
            aria-label={t("tracking.partnerBadge.viewingAriaLabel")}
          />
        )}
      </span>
      <span>
        <span className="block font-semibold text-sm">{name}</span>
        <span className="block text-xs text-text-secondary">
          {viewing
            ? t("tracking.partnerBadge.viewingText")
            : t("tracking.partnerBadge.verifiedText")}
        </span>
      </span>
    </div>
  );
}
