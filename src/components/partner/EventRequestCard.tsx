"use client";
import Link from "next/link";
import { Calendar, Users, Wallet } from "lucide-react";
import { useT, useLocale } from "@/lib/i18n/messages-provider";
import { formatNumber } from "@/lib/i18n/format";

const STATUS_TONES: Record<string, string> = {
  new: "bg-[color:var(--color-occasion-product-soft)] text-[color:var(--color-occasion-product)]",
  viewing:
    "bg-[color:var(--color-occasion-corporate-soft)] text-[color:var(--color-occasion-corporate)]",
  replied: "bg-surface-bg text-text-secondary",
  quoted:
    "bg-[color:var(--color-occasion-wedding-soft)] text-[color:var(--color-occasion-wedding)]",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-zinc-100 text-zinc-500",
};

export interface Row {
  id: string;
  occasion: string;
  eventDate: string;
  partySize: number;
  guestName: string;
  status: string;
  createdAt: Date;
  budgetPerHeadCents: number | null;
}

export function EventRequestCard({
  row,
  nowMs,
}: {
  row: Row;
  nowMs: number;
}) {
  const t = useT("partner.corporate");
  const locale = useLocale();
  const days = Math.floor(
    (nowMs - new Date(row.createdAt).getTime()) / 86_400_000,
  );
  const urgent = row.status === "new" && days >= 2;
  const toneClass =
    STATUS_TONES[row.status] ?? "bg-surface-bg text-text-secondary";
  const statusLabel = STATUS_TONES[row.status]
    ? t(`status.${row.status}`)
    : row.status;
  const occasionLabel = t(`occasion.${row.occasion}`);
  return (
    <Link
      href={`/partner/corporate/events/${row.id}`}
      className={`block rounded-card border bg-surface-white p-4 hover:shadow-card-hover transition-shadow ${urgent ? "border-amber-400" : "border-border"}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{row.guestName}</p>
          <p className="text-sm text-text-secondary">
            {occasionLabel === `occasion.${row.occasion}`
              ? row.occasion
              : occasionLabel}
          </p>
        </div>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${toneClass}`}
        >
          {statusLabel}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-sm text-text-secondary">
        <span className="inline-flex items-center gap-1">
          <Calendar className="w-4 h-4" /> {row.eventDate}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="w-4 h-4" /> {row.partySize} {t("card.personsSuffix")}
        </span>
        {row.budgetPerHeadCents != null && (
          <span className="inline-flex items-center gap-1">
            <Wallet className="w-4 h-4" />{" "}
            {t("card.budgetPerHead", {
              amount: formatNumber(
                Math.round(row.budgetPerHeadCents / 100),
                locale,
              ),
            })}
          </span>
        )}
        <span className={`ml-auto ${urgent ? "text-amber-600 font-medium" : ""}`}>
          {t("card.daysWaiting", { count: days, days })}
        </span>
      </div>
    </Link>
  );
}
